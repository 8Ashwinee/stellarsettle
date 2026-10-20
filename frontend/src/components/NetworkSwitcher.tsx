import { networkConfigs, type NetworkName } from "../lib/networks";
import "./network-switcher.css";

export function NetworkSwitcher({ current, onChange }: { current: NetworkName; onChange: (name: NetworkName) => void }) {
  return (
    <div className="network-switcher" role="group" aria-label="Network">
      <span className={`network-switcher-dot ${current}`} aria-hidden="true" />
      <select aria-label={`Network (current: ${networkConfigs[current].label})`} value={current} onChange={(event) => onChange(event.target.value as NetworkName)}>
        {Object.values(networkConfigs).map((config) => <option key={config.name} value={config.name}>{config.label}</option>)}
      </select>
    </div>
  );
}
