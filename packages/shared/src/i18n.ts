import type { Lang } from './types.js';

type Dict = Record<string, string>;

const en: Dict = {
  'home.next': 'Next collection',
  'home.binFull': 'My bin is full',
  'home.extra': 'Request extra pickup',
  'home.reported': 'Reported — the crew will plan your pickup',
  'home.points': 'Green points',
  'home.unpaid': 'Bill due',
  'home.paid': 'All bills paid',
  'nav.home': 'Home',
  'nav.pay': 'Pay',
  'nav.sort': 'Sort',
  'nav.track': 'Track',
  'nav.more': 'More',
  'common.retry': 'Try again',
  'common.offline': 'You are offline. Changes will sync when the network returns.',
};
const rw: Dict = {
  'home.next': 'Igihe bazatwara imyanda',
  'home.binFull': 'Ingunguru yanjye yuzuye',
  'home.extra': 'Saba ko bayitwara',
  'home.reported': 'Byoherejwe — abakozi bazategura kuyitwara',
  'home.points': 'Amanota y’ibidukikije',
  'home.unpaid': 'Fagitire itarishyurwa',
  'home.paid': 'Fagitire zose zarishyuwe',
  'nav.home': 'Ahabanza',
  'nav.pay': 'Kwishyura',
  'nav.sort': 'Gutandukanya',
  'nav.track': 'Imodoka',
  'nav.more': 'Ibindi',
  'common.retry': 'Ongera ugerageze',
  'common.offline': 'Nta murandasi. Bizoherezwa umurandasi ugarutse.',
};
const fr: Dict = {
  'home.next': 'Prochaine collecte',
  'home.binFull': 'Ma poubelle est pleine',
  'home.extra': 'Demander une collecte',
  'home.reported': 'Signalé — l’équipe planifiera la collecte',
  'home.points': 'Points verts',
  'home.unpaid': 'Facture à payer',
  'home.paid': 'Factures réglées',
  'nav.home': 'Accueil',
  'nav.pay': 'Payer',
  'nav.sort': 'Trier',
  'nav.track': 'Camion',
  'nav.more': 'Plus',
  'common.retry': 'Réessayer',
  'common.offline': 'Hors ligne. Les changements seront synchronisés au retour du réseau.',
};

export const DICTS: Record<Lang, Dict> = { en, rw, fr };
export function t(lang: Lang, key: string): string {
  return DICTS[lang][key] ?? en[key] ?? key;
}
