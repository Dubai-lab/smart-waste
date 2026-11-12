import type { Lang } from '@sw/shared';
import { useAuth } from './auth';

type Dict = Record<string, string>;
const en: Dict = {
  home: 'Home', track: 'Track', pay: 'Pay', sort: 'Sort', more: 'More', route: 'Route', scan: 'Scan', sync: 'Sync',
  binSensor: 'Bin sensor', binLevel: '{p}% full', sensorSeen: 'Checked {t}', sensorBattery: 'Sensor battery low',
  sensorReports: 'Your bin sensor reports automatically when the bin is full. For a special collection, request an extra pickup.',
  soonerReport: 'or sooner if you report a full bin', soonerSensor: 'or sooner when your sensor sees a full bin',
  nextCollection: 'Next collection', binFull: 'My bin is full', extraPickup: 'Request extra pickup',
  reported: 'Reported — your pickup will be planned', points: 'Green points', worth: 'worth {v} RWF off your next bill',
  billDue: 'Bill due', allPaid: 'All bills paid', payNow: 'Pay with MoMo', today: 'Today', eta: 'Truck expected around {t}',
  collectedToday: 'Collected today', signIn: 'Sign in', signUp: 'Create account', email: 'Email', password: 'Password',
  fullName: 'Full name', phone: 'Phone number', complaint: 'Report a problem', recyclables: 'Sell recyclables',
  leaderboard: 'Village leaderboard', myQr: 'My QR code', profile: 'Profile', signOut: 'Sign out', language: 'Language',
  retry: 'Try again', offline: 'You are offline. Changes will sync when the network returns.', notifications: 'Notifications',
  takePhoto: 'Take a photo', identify: 'Identify waste', truckNotOut: 'No truck on the road right now',
};
const rw: Dict = {
  home: 'Ahabanza', track: 'Imodoka', pay: 'Kwishyura', sort: 'Gutandukanya', more: 'Ibindi', route: 'Urugendo', scan: 'Gusikana', sync: 'Kohereza',
  binSensor: 'Sensa y’ingunguru', binLevel: 'Yuzuye {p}%', sensorSeen: 'Byarebwe {t}', sensorBattery: 'Bateri ya sensa iri hasi',
  sensorReports: 'Sensa y’ingunguru yawe yimenyesha ubwayo iyo yuzuye. Ku gutwara bidasanzwe, saba ko bayitwara.',
  soonerReport: 'cyangwa vuba niba umenyesheje ko yuzuye', soonerSensor: 'cyangwa vuba iyo sensa ibonye ko yuzuye',
  nextCollection: 'Igihe bazatwara imyanda', binFull: 'Ingunguru yanjye yuzuye', extraPickup: 'Saba ko bayitwara',
  reported: 'Byoherejwe — bazateganya kuyitwara', points: 'Amanota y’ibidukikije', worth: 'agabanya {v} RWF kuri fagitire itaha',
  billDue: 'Fagitire itarishyurwa', allPaid: 'Fagitire zose zarishyuwe', payNow: 'Ishyura na MoMo', today: 'Uyu munsi', eta: 'Imodoka iteganyijwe saa {t}',
  collectedToday: 'Byatwawe uyu munsi', signIn: 'Injira', signUp: 'Fungura konti', email: 'Imeri', password: 'Ijambo ry’ibanga',
  fullName: 'Amazina yombi', phone: 'Telefoni', complaint: 'Tanga ikibazo', recyclables: 'Gurisha ibisubirwamo',
  leaderboard: 'Urutonde rw’imidugudu', myQr: 'QR yanjye', profile: 'Umwirondoro', signOut: 'Sohoka', language: 'Ururimi',
  retry: 'Ongera ugerageze', offline: 'Nta murandasi. Bizoherezwa umurandasi ugarutse.', notifications: 'Ubutumwa',
  takePhoto: 'Fata ifoto', identify: 'Menya ubwoko bw’imyanda', truckNotOut: 'Nta modoka iri mu muhanda ubu',
};
const fr: Dict = {
  home: 'Accueil', track: 'Camion', pay: 'Payer', sort: 'Trier', more: 'Plus', route: 'Tournée', scan: 'Scanner', sync: 'Synchro',
  binSensor: 'Capteur de poubelle', binLevel: 'Pleine à {p} %', sensorSeen: 'Mesuré {t}', sensorBattery: 'Batterie du capteur faible',
  sensorReports: 'Le capteur signale automatiquement quand la poubelle est pleine. Pour une collecte spéciale, demandez une collecte.',
  soonerReport: 'ou plus tôt si vous signalez une poubelle pleine', soonerSensor: 'ou plus tôt quand le capteur voit une poubelle pleine',
  nextCollection: 'Prochaine collecte', binFull: 'Ma poubelle est pleine', extraPickup: 'Demander une collecte',
  reported: 'Signalé — la collecte sera planifiée', points: 'Points verts', worth: 'soit {v} RWF de réduction',
  billDue: 'Facture à payer', allPaid: 'Factures réglées', payNow: 'Payer avec MoMo', today: 'Aujourd’hui', eta: 'Camion prévu vers {t}',
  collectedToday: 'Collecté aujourd’hui', signIn: 'Se connecter', signUp: 'Créer un compte', email: 'E-mail', password: 'Mot de passe',
  fullName: 'Nom complet', phone: 'Téléphone', complaint: 'Signaler un problème', recyclables: 'Vendre des recyclables',
  leaderboard: 'Classement des villages', myQr: 'Mon code QR', profile: 'Profil', signOut: 'Se déconnecter', language: 'Langue',
  retry: 'Réessayer', offline: 'Hors ligne. Synchronisation au retour du réseau.', notifications: 'Notifications',
  takePhoto: 'Prendre une photo', identify: 'Identifier le déchet', truckNotOut: 'Aucun camion en route',
};
const DICTS: Record<Lang, Dict> = { en, rw, fr };

export function useT() {
  const { profile } = useAuth();
  const lang: Lang = profile?.lang ?? 'en';
  return (key: string, vars: Record<string, string | number> = {}) =>
    (DICTS[lang][key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
