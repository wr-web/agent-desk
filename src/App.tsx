import { useEffect, useState } from "react";
import { api } from "./api";
import type { Desk } from "./types";
import { Home } from "./Home";
import { DeskView } from "./DeskView";

export default function App() {
  const [desks, setDesks] = useState<Desk[]>([]);
  const [active, setActive] = useState<Desk | null>(null);
  const [home, setHome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.list().then(setDesks).catch((cause: Error) => setError(cause.message));
  }, []);

  const create = async (name: string) => {
    setBusy(true);
    try {
      const desk = await api.create(name);
      setDesks((current) => [desk, ...current]);
      setActive(desk);
      setHome(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    if (active?.id === id) {
      setHome(false);
      return;
    }
    setBusy(true);
    try {
      setActive(await api.get(id));
      setHome(false);
    }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this stored desk and stop its terminals?")) return;
    await api.remove(id);
    setDesks((current) => current.filter((desk) => desk.id !== id));
    if (active?.id === id) setActive(null);
  };

  const stored = (desk: Desk) => setDesks((current) => [desk, ...current.filter((item) => item.id !== desk.id)]);

  return <>{home && <Home desks={desks} busy={busy} onCreate={create} onOpen={open} onDelete={remove} />}{active && <div className={home ? "parked-desk" : "active-desk"}><DeskView key={active.id} initial={active} onHome={() => setHome(true)} onStored={stored} /></div>}{error && <button className="global-error" onClick={() => setError("")}>{error}<span>×</span></button>}</>;
}
