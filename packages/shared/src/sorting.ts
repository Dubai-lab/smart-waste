import type { Lang } from './types.js';

/** Classes produced by the on-device waste classifier. */
export const SORT_CLASSES = ['organic', 'plastic', 'paper', 'metal', 'glass', 'other'] as const;
export type SortClass = (typeof SORT_CLASSES)[number];

export const SORT_TIPS: Record<SortClass, Record<Lang, { title: string; bin: string; tip: string }>> = {
  organic: {
    en: { title: 'Organic', bin: 'Green bin (organic)', tip: 'Food scraps, peels and garden waste. Drain liquids. Can be composted.' },
    rw: { title: "Imyanda ibora", bin: 'Ingunguru y’icyatsi (ibora)', tip: 'Ibisigazwa by’ibiryo, ibishishwa n’ibyatsi. Kuramo amazi. Bishobora kuvamo ifumbire.' },
    fr: { title: 'Organique', bin: 'Bac vert (organique)', tip: 'Restes alimentaires, épluchures et déchets verts. Égouttez les liquides. Compostable.' },
  },
  plastic: {
    en: { title: 'Plastic', bin: 'Recyclables bag', tip: 'Bottles and containers. Rinse, squash and remove caps. Plastic bags are banned in Rwanda — never burn plastic.' },
    rw: { title: 'Pulasitiki', bin: 'Umufuka w’ibisubirwamo', tip: 'Amacupa n’ibikoresho. Yoza, uyakande, ukuremo imifuniko. Ntugatwike pulasitiki.' },
    fr: { title: 'Plastique', bin: 'Sac recyclables', tip: 'Bouteilles et contenants. Rincez, écrasez, retirez les bouchons. Ne brûlez jamais le plastique.' },
  },
  paper: {
    en: { title: 'Paper & cardboard', bin: 'Recyclables bag', tip: 'Keep dry and flatten boxes. Greasy or wet paper goes to organic.' },
    rw: { title: 'Impapuro n’amakarito', bin: 'Umufuka w’ibisubirwamo', tip: 'Bigumane byumutse, uzinge amakarito. Impapuro zanduye zijya mu bibora.' },
    fr: { title: 'Papier et carton', bin: 'Sac recyclables', tip: 'Gardez au sec et aplatissez les cartons. Papier gras ou mouillé : organique.' },
  },
  metal: {
    en: { title: 'Metal', bin: 'Recyclables bag', tip: 'Cans and tins. Rinse them. Metal has good resale value — list it in the marketplace.' },
    rw: { title: 'Ibyuma', bin: 'Umufuka w’ibisubirwamo', tip: 'Amakopo n’ibikombe by’icyuma. Byoze. Ushobora kubigurisha ku isoko ry’ibisubirwamo.' },
    fr: { title: 'Métal', bin: 'Sac recyclables', tip: 'Canettes et boîtes. Rincez-les. Le métal se revend bien — publiez-le sur le marché.' },
  },
  glass: {
    en: { title: 'Glass', bin: 'Glass — separate', tip: 'Bottles and jars. Keep separate and wrap broken glass to protect the crew.' },
    rw: { title: 'Ibirahure', bin: 'Ibirahure — ukwabyo', tip: 'Amacupa n’ibibindi. Bitandukanye n’ibindi, upfunyike ibimenetse ngo bidakomeretsa abakozi.' },
    fr: { title: 'Verre', bin: 'Verre — à part', tip: 'Bouteilles et bocaux. À part ; emballez le verre cassé pour protéger l’équipe.' },
  },
  other: {
    en: { title: 'Other / residual', bin: 'General waste', tip: 'Items that cannot be recycled. Batteries and electronics: keep aside for e-waste collection.' },
    rw: { title: 'Ibindi', bin: 'Imyanda isanzwe', tip: 'Ibidashobora gusubirwamo. Amabuye ya radiyo n’ibyuma by’ikoranabuhanga: bibike ukwabyo.' },
    fr: { title: 'Autres / résiduels', bin: 'Déchets généraux', tip: 'Non recyclables. Piles et électronique : à garder pour la collecte des DEEE.' },
  },
};
