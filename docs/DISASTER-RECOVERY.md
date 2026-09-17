# Wakala Disaster Recovery Runbook

This document describes the production recovery model for Wakala.

## Backup layers

1. Supabase platform backups / PITR remain the first recovery option when available.
2. GitHub Actions creates an independent encrypted PostgreSQL logical backup every day at 02:00 UTC.
3. The encrypted backup is uploaded to private S3-compatible object storage.
4. A short-lived GitHub Actions artifact is kept for seven days as a secondary copy.
5. Wakala source code, SQL and Edge Functions remain versioned in GitHub.

## GitHub secrets required

Configure these repository or environment secrets before enabling production backups:

- `WAKALA_DATABASE_URL` — production PostgreSQL connection string. Use a connection suitable for `pg_dump`; do not use the browser anon key.
- `WAKALA_BACKUP_BUCKET` — private S3-compatible bucket name.
- `WAKALA_BACKUP_ACCESS_KEY` — restricted object-storage access key.
- `WAKALA_BACKUP_SECRET_KEY` — restricted object-storage secret.
- `WAKALA_BACKUP_ENDPOINT` — S3-compatible endpoint, such as an R2/B2/S3 endpoint.
- `WAKALA_BACKUP_REGION` — storage region; `auto` is appropriate for providers that support it.
- `WAKALA_BACKUP_ENCRYPTION_KEY` — long random encryption secret used only by the backup workflow.

### Secret handling

Never commit any of these values to GitHub. Store the encryption key separately from the backup bucket credentials where practical. If the encryption key is lost, the encrypted backups cannot be decrypted.

## Backup contents

The PostgreSQL logical dump covers application database objects and data accessible through the supplied database connection, including Wakala application tables such as profiles, wallets, wallet balances, transactions, eSIM orders and admin records.

The repository schema currently includes these application areas and Edge Functions. Keep database and object-storage backups separate because PostgreSQL dumps do not contain uploaded Storage objects.

## Storage backup

If Wakala uses Supabase Storage for customer documents, QR assets, receipts or other files, add a separate scheduled object-storage replication job. Database backup alone is not sufficient for those files.

## Daily backup flow

```text
GitHub Actions
      |
      v
pg_dump production
      |
      v
pg_restore --list validation
      |
      v
AES-256 encryption
      |
      v
SHA-256 checksum
      |
      v
Private object storage
```

## Retention

The workflow defaults to 30 days in object storage and seven days for the GitHub Actions artifact. Configure object-storage lifecycle rules for the desired 30-day rolling retention and longer weekly/monthly archives.

The workflow's `retention_days` input records the intended retention in the manifest; actual deletion should be enforced by the object-storage lifecycle policy rather than by the GitHub runner.

## Restore a database backup

1. Provision a new PostgreSQL/Supabase project.
2. Retrieve the encrypted `.dump.enc`, checksum and manifest from private backup storage.
3. Verify the SHA-256 checksum.
4. Decrypt the dump using the protected `WAKALA_BACKUP_ENCRYPTION_KEY`.
5. Inspect the dump with `pg_restore --list`.
6. Restore into the new database with `pg_restore`.
7. Reconfigure Auth, Storage, Edge Functions, SMTP and project secrets separately.
8. Verify RLS policies, triggers, functions, customer profiles, wallets, balances and transaction history.
9. Run application smoke tests before directing production traffic to the recovered project.

Example commands after retrieving a backup:

```bash
sha256sum -c wakala-YYYY-MM-DDTHH-MM-SSZ.sha256

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in wakala-YYYY-MM-DDTHH-MM-SSZ.dump.enc \
  -out wakala-restore.dump \
  -pass env:WAKALA_BACKUP_ENCRYPTION_KEY

pg_restore --list wakala-restore.dump

pg_restore \
  --dbname="$RECOVERY_DATABASE_URL" \
  --no-owner \
  --no-acl \
  wakala-restore.dump
```

Do not run a production restore without first taking a fresh backup and confirming the target project is the intended recovery environment.

## Auth users

The application database dump should not be treated as the complete Auth disaster-recovery mechanism. Supabase-managed Auth data and project configuration require a separate recovery procedure. Maintain access to the original Supabase project and use Supabase's supported project backup/restore or project-cloning facilities when recovering Auth users.

## Recovery priorities

1. Protect and preserve the latest known-good backup.
2. Stop destructive writes if the incident is ongoing.
3. Determine whether Supabase PITR/platform recovery can resolve the incident.
4. If an independent restore is required, create an isolated recovery project.
5. Restore and validate the database.
6. Restore Storage objects and deploy Edge Functions.
7. Reconfigure secrets and integrations.
8. Test authentication, onboarding, dashboard, wallets, transactions, eSIM and admin functions.
9. Only then switch production traffic.

## Test the backup

A backup is not considered fully trusted until it has been restored successfully in an isolated environment. Perform a restore drill at least quarterly and after major schema changes.
