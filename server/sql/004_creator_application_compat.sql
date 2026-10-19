alter table creator_campaigns add column if not exists requirements text;

alter table creator_applications
  add column if not exists campaign_id bigint references creator_campaigns(id) on delete set null;
alter table creator_applications add column if not exists portfolio_url text;
alter table creator_applications add column if not exists application_note text;
alter table creator_applications add column if not exists followers_count bigint;
alter table creator_applications add column if not exists content_format text;
alter table creator_applications add column if not exists content_idea text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'creator_applications'::regclass
      and conname = 'creator_applications_user_id_key'
  ) then
    alter table creator_applications drop constraint creator_applications_user_id_key;
  end if;
end $$;

create unique index if not exists creator_applications_user_campaign_uidx
  on creator_applications(user_id,campaign_id) where campaign_id is not null;

insert into creator_campaigns(title,platform,content_type,reward_per_1000_impressions,max_reward,status,description,requirements)
select 'Wakala Awareness', 'All platforms', 'Short video', 1.25, 250, 'active',
       'Introduce Wakala and explain how local-currency payments can help people across Africa.',
       'Original content, clear disclosure, no unsupported earnings promises.'
where not exists (select 1 from creator_campaigns where title='Wakala Awareness');

insert into creator_campaigns(title,platform,content_type,reward_per_1000_impressions,max_reward,status,description,requirements)
select 'How Wakala Helps', 'TikTok / Instagram', 'Explainer video', 1.50, 300, 'active',
       'Create a practical explainer about cross-border payments and supported local currencies.',
       'Show a real product walkthrough; do not claim unsupported provider coverage.'
where not exists (select 1 from creator_campaigns where title='How Wakala Helps');

insert into creator_campaigns(title,platform,content_type,reward_per_1000_impressions,max_reward,status,description,requirements)
select 'Creator Challenge', 'YouTube / Instagram', 'UGC / Skit', 1.00, 200, 'active',
       'Make an original skit or creator video around easier money movement.',
       'Submit a public post URL and authentic audience metrics for review.'
where not exists (select 1 from creator_campaigns where title='Creator Challenge');

insert into creator_campaigns(title,platform,content_type,reward_per_1000_impressions,max_reward,status,description,requirements)
select 'Create UGC', 'All platforms', 'User-generated content', 1.20, 150, 'active',
       'Create a concise, reusable UGC clip introducing the Wakala brand.',
       'Original footage and permission for the submitted usage rights are required.'
where not exists (select 1 from creator_campaigns where title='Create UGC');
