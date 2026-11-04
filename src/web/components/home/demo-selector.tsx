import { Check, Package } from "lucide-react";
import { demoScenarios, type DemoId } from "./demo-content";

type Props = { selected: DemoId; onSelect: (id: DemoId) => void; label: string };

export function DemoSelector({ selected, onSelect, label }: Props) {
  return <div className="home-demo-selector" role="group" aria-label={label}>
    {(["packing"] as const).map(id => {
      const scenario = demoScenarios[id];
      return <button key={id} type="button" aria-pressed={selected === id} onClick={() => onSelect(id)}><img src={scenario.image} alt="" width={48} height={38} /><span><Package size={12} aria-hidden="true" />{scenario.label}</span><span className="demo-selector-state" aria-hidden="true">{selected === id ? <Check size={13} /> : <span />}</span></button>;
    })}
  </div>;
}
