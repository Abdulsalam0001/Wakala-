const WAKALA_BANKS = {
  TZ: {
    name: 'Tanzania',
    banks: [
      'Absa Bank Tanzania',
      'Access Bank Tanzania',
      'Akiba Commercial Bank',
      'Amana Bank',
      'Azania Bank',
      'Bank of Africa Tanzania',
      'Bank of Baroda Tanzania',
      'Bank of India Tanzania',
      'Canara Bank Tanzania',
      'Citibank Tanzania',
      'CRDB Bank',
      'DCB Commercial Bank',
      'Diamond Trust Bank Tanzania',
      'Ecobank Tanzania',
      'Equity Bank Tanzania',
      'Exim Bank Tanzania',
      'Guaranty Trust Bank Tanzania',
      'I&M Bank Tanzania',
      'KCB Bank Tanzania',
      'Mkombozi Commercial Bank',
      'Mwalimu Commercial Bank',
      'NBC Tanzania',
      'NCBA Bank Tanzania',
      'NMB Bank',
      'Stanbic Bank Tanzania',
      'Standard Chartered Bank Tanzania',
      'Tanzania Commercial Bank',
      'UBA Tanzania',

      // Microfinance / financial institutions
      'FINCA Microfinance Bank Tanzania',
      'VisionFund Tanzania Microfinance Bank',
      'LOLC Tanzania Microfinance Bank',
      'Selcom Microfinance Bank',
      'Radiance Microfinance Bank',
      'Mucoba Bank'
    ]
  },

  ZZ: {
    name: 'Zanzibar corridor',
    banks: [
      'CRDB Bank',
      'NMB Bank',
      'NBC Tanzania',
      'Stanbic Bank Tanzania',
      'Absa Bank Tanzania',
      'Exim Bank Tanzania',
      'Tanzania Commercial Bank',
      'Diamond Trust Bank Tanzania',
      'KCB Bank Tanzania',
      'NCBA Bank Tanzania',
      'I&M Bank Tanzania',
      'Access Bank Tanzania',
      'Bank of Africa Tanzania',
      'Equity Bank Tanzania',
      'Amana Bank',
      'Peoples Bank of Zanzibar (PBZ)',

      // Microfinance / financial institutions
      'FINCA Microfinance Bank Tanzania',
      'VisionFund Tanzania Microfinance Bank',
      'LOLC Tanzania Microfinance Bank',
      'Selcom Microfinance Bank',
      'Radiance Microfinance Bank'
    ]
  },

  KE: {
    name: 'Kenya',
    banks: [
      'Absa Bank Kenya',
      'Access Bank Kenya',
      'ABC Bank Kenya',
      'Bank of Africa Kenya',
      'Bank of Baroda Kenya',
      'Bank of India Kenya',
      'Citibank Kenya',
      'Consolidated Bank of Kenya',
      'Co-operative Bank of Kenya',
      'Credit Bank',
      'Development Bank of Kenya',
      'Diamond Trust Bank Kenya',
      'Dubai Islamic Bank Kenya',
      'Ecobank Kenya',
      'Equity Bank Kenya',
      'Family Bank',
      'Guaranty Trust Bank Kenya',
      'Guardian Bank',
      'Gulf African Bank',
      'I&M Bank Kenya',
      'KCB Bank Kenya',
      'Kingdom Bank',
      'Middle East Bank Kenya',
      'NCBA Bank Kenya',
      'National Bank of Kenya',
      'Prime Bank',
      'SBM Bank Kenya',
      'Sidian Bank',
      'Stanbic Bank Kenya',
      'Standard Chartered Bank Kenya',
      'UBA Kenya',
      'Victoria Commercial Bank',

      // Microfinance banks
      'Faulu Microfinance Bank',
      'Kenya Women Microfinance Bank',
      'KWFT Microfinance Bank',
      'SMEP Microfinance Bank',
      'Rafiki Microfinance Bank',
      'Caritas Microfinance Bank',
      'Sumac Microfinance Bank',
      'Century Microfinance Bank',
      'Daraja Microfinance Bank',
      'Choice Microfinance Bank',
      'Muungano Microfinance Bank',
      'U & I Microfinance Bank'
    ]
  },

  RW: {
    name: 'Rwanda',
    banks: [
      'Access Bank Rwanda',
      'Bank of Africa Rwanda',
      'Bank of Kigali',
      'BPR Bank Rwanda',
      'BRD Development Bank of Rwanda',
      'Ecobank Rwanda',
      'Equity Bank Rwanda',
      'GT Bank Rwanda',
      'I&M Bank Rwanda',
      'NCBA Bank Rwanda',
      'Zigama Credit and Savings Bank',

      // Microfinance / financial institutions
      'Urwego Bank',
      'Umurenge SACCO',
      'Duterimbere IMF',
      'RIM Ltd',
      'VisionFund Rwanda',
      'Umutanguha Finance Company',
      'AB Bank Rwanda',
      'Letshego Rwanda'
    ]
  },

  NG: {
    name: 'Nigeria',
    banks: [
      'Access Bank',
      'Citibank Nigeria',
      'Ecobank Nigeria',
      'Fidelity Bank',
      'First Bank of Nigeria',
      'First City Monument Bank (FCMB)',
      'Globus Bank',
      'Guaranty Trust Bank (GTBank)',
      'Jaiz Bank',
      'Keystone Bank',
      'Lotus Bank',
      'Moniepoint Microfinance Bank',
      'Nova Commercial Bank',
      'Parallex Bank',
      'Premium Trust Bank',
      'Polaris Bank',
      'Providus Bank',
      'Stanbic IBTC Bank',
      'Standard Chartered Bank Nigeria',
      'Sterling Bank',
      'SunTrust Bank',
      'TAJBank',
      'Titan Trust Bank',
      'Union Bank of Nigeria',
      'United Bank for Africa (UBA)',
      'Unity Bank',
      'Wema Bank',
      'Zenith Bank',

      // Microfinance banks
      'AB Microfinance Bank',
      'Accion Microfinance Bank',
      'Addosser Microfinance Bank',
      'Baobab Microfinance Bank',
      'Baines Credit Microfinance Bank',
      'Boctrust Microfinance Bank',
      'Covenant Microfinance Bank',
      'Credit Direct Microfinance Bank',
      'Ekondo Microfinance Bank',
      'FairMoney Microfinance Bank',
      'Finca Microfinance Bank Nigeria',
      'Firmus Microfinance Bank',
      'Fortis Microfinance Bank',
      'Hasal Microfinance Bank',
      'Infinity Microfinance Bank',
      'Lapo Microfinance Bank',
      'Mainstreet Microfinance Bank',
      'Mutual Trust Microfinance Bank',
      'NPF Microfinance Bank',
      'PecanTrust Microfinance Bank',
      'Peace Microfinance Bank',
      'Personal Trust Microfinance Bank',
      'Sparkle Microfinance Bank',
      'Taj Microfinance Bank',
      'Titan Microfinance Bank',
      'VFD Microfinance Bank',
      'Virtue Microfinance Bank'
    ]
  }
};

function addBankDirectory() {
  const externalTab = document.getElementById('external-tab');
  const bankName = document.getElementById('bankName');

  if (!externalTab || !bankName) return;

  const countryGroup = document.createElement('div');
  countryGroup.className = 'form-group';

  countryGroup.innerHTML = `
    <label for="bankCountry">Recipient country</label>
    <select id="bankCountry" required>
      ${Object.entries(WAKALA_BANKS)
        .map(
          ([code, country]) =>
            `<option value="${code}">${country.name}</option>`
        )
        .join('')}
    </select>
  `;

  const bankGroup = bankName.closest('.form-group');

  const bankSelect = document.createElement('select');
  bankSelect.id = 'bankName';
  bankSelect.name = bankName.name || 'bankName';
  bankSelect.className = bankName.className;
  bankSelect.required = true;

  bankGroup.replaceChild(bankSelect, bankName);

  externalTab.insertBefore(countryGroup, bankGroup);

  const countrySelect = document.getElementById('bankCountry');

  const updateBanks = () => {
    const country = WAKALA_BANKS[countrySelect.value];

    bankSelect.innerHTML =
      '<option value="">Choose a bank</option>' +
      country.banks
        .map(bank => `<option value="${bank}">${bank}</option>`)
        .join('');
  };

  countrySelect.addEventListener('change', updateBanks);

  updateBanks();
}

document.addEventListener('DOMContentLoaded', addBankDirectory);