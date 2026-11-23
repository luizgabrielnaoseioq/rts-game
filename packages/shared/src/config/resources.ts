// GDD seção 6 — recursos.
import type { ResourceKey, Resources } from '../contracts/common';

export interface ResourceDef {
  name: string;
  use: string;
  /** Emoji só para protótipo (GDD 17). */
  emoji: string;
}

export const RESOURCES: Record<ResourceKey, ResourceDef> = {
  food: { name: 'Comida', use: 'Tropas (treino e manutenção), prédios', emoji: '🌾' },
  wood: { name: 'Madeira', use: 'Prédios, tropas', emoji: '🪵' },
  stone: { name: 'Pedra', use: 'Muralha, prédios, tropas T2/T3', emoji: '🪨' },
  gold: { name: 'Ouro', use: 'Cidadela, muralha, salão, tropas T2/T3, taverna, cura', emoji: '🪙' },
};

/** Produção base fixa da Cidadela (/h, antes do ECONOMY_SPEED). */
export const KEEP_BASE_PRODUCTION: Resources = { food: 100, wood: 100, stone: 50, gold: 20 };

/** Recursos iniciais da cidade. */
export const START_RESOURCES: Resources = { food: 1500, wood: 1500, stone: 800, gold: 500 };
