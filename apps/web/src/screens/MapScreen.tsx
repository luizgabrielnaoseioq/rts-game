import { biomeAt } from '@wn/shared';
import { MarchDialog } from '../components/MarchDialog';
import { MarchList, Minimap } from '../components/MapHud';
import { TilePopup } from '../components/TilePopup';
import { Icon } from '../components/icons';
import { biomeName } from '../i18n/labels';
import { fmtCoord } from '../lib/format';
import { useCityStore } from '../stores/city';
import { useUiStore } from '../stores/ui';
import { useWorldStore } from '../stores/world';

/** HUD React por cima do canvas Phaser (o canvas mora no GameLayout). */
export function MapScreen() {
  const city = useCityStore((s) => s.city);
  const info = useWorldStore((s) => s.info);
  const hover = useUiStore((s) => s.hoverTile);
  const draft = useUiStore((s) => s.marchDraft);
  const focusOn = useUiStore((s) => s.focusOn);

  return (
    <div className="map-hud">
      {!info && <div className="map-loading panel">Carregando o mundo…</div>}
      <div className="map-tools">
        <button className="btn" disabled={!city} onClick={() => city && focusOn(city.x, city.y)}>
          <Icon name="keep" size={16} /> Ir para minha cidade
        </button>
        {hover && info && (
          <span className="coord-pill panel">
            {fmtCoord(hover.x, hover.y)} · {biomeName(biomeAt(info.seed, hover.x, hover.y, info.height))}
          </span>
        )}
      </div>
      <MarchList />
      <TilePopup />
      <Minimap />
      {draft && <MarchDialog key={`${draft.type}:${draft.targetX}:${draft.targetY}`} />}
    </div>
  );
}
