export function PrivacyText() {
  return (
    <div className="space-y-3 text-sm leading-relaxed [&_h3]:mt-4 [&_h3]:font-semibold">
      <p>This system is a <strong>final year research project</strong> (BSc Software Engineering, 2026/2027). Contact: Danecious Smallwood, <a className="underline" href="mailto:danecioussmallwood20@gmail.com">danecioussmallwood20@gmail.com</a>. It runs a pilot of a household waste collection service. It is not a registered company and no real money is collected — Mobile Money runs in test (sandbox) mode.</p>
      <h3>What we collect</h3>
      <ul className="list-disc pl-5">
        <li>Account: name, email, phone number, role, language.</li>
        <li>Household: label/address, map location, household size.</li>
        <li>Service records: pickup scans (time, crew GPS position, bin fill level, optional photo), bin-full reports, complaints and photos, bills and test payments, green points.</li>
        <li>Crew phones share their GPS position <strong>only while a route is in progress</strong>.</li>
        <li>AI sorting assistant: the photo is analysed <strong>on your phone</strong> and is not uploaded; only the predicted category is stored.</li>
      </ul>
      <h3>Why</h3>
      <p>To plan collection, verify pickups, settle disputes, send alerts, run the reward scheme and evaluate the system for the research (accuracy, savings, user acceptance). Legal basis: your consent (Law N° 058/2021 relating to the protection of personal data and privacy, Rwanda).</p>
      <h3>Who can see it</h3>
      <p>Only the roles that need it: you, the collection company staff of the pilot, crews in your zone (address and location only), and local authority officers (service quality and complaints). Data is hosted by Supabase (EU region, Ireland) and is never sold.</p>
      <h3>How long</h3>
      <p>Until the end of the project (31 July 2027). Afterwards data is deleted or fully anonymised for the final report.</p>
      <h3>Your rights</h3>
      <p>You may access, correct or delete your data, or withdraw consent at any time, by emailing <a className="underline" href="mailto:danecioussmallwood20@gmail.com">danecioussmallwood20@gmail.com</a>. Withdrawing does not affect the pilot records already anonymised.</p>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Privacy notice</h1>
      <PrivacyText />
    </div>
  );
}
