import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Desk } from "./types.js";

const dataDir = path.join(process.cwd(), "data");
const storeFile = path.join(dataDir, "desks.json");

async function readAll(): Promise<Desk[]> {
  try {
    return JSON.parse(await readFile(storeFile, "utf8")) as Desk[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeAll(desks: Desk[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storeFile, `${JSON.stringify(desks, null, 2)}\n`, "utf8");
}

export async function listDesks() {
  return (await readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDesk(id: string) {
  return (await readAll()).find((desk) => desk.id === id);
}

export async function saveDesk(desk: Desk) {
  const desks = await readAll();
  const index = desks.findIndex((item) => item.id === desk.id);
  if (index === -1) desks.push(desk);
  else desks[index] = desk;
  await writeAll(desks);
  return desk;
}

export async function deleteDesk(id: string) {
  const desks = await readAll();
  await writeAll(desks.filter((desk) => desk.id !== id));
}
