/**
 * Revisa que todas las herramientas de IA encuentren las reglas del equipo
 * (`npm run check:ai`, también en el CI).
 *
 * Cada IA lee sola un archivo con un nombre fijo al abrir el repositorio. Si a
 * uno le falta el enlace o el resumen de las reglas críticas, esa IA puede
 * escribir código sin conocerlas. Este script falla si:
 *   1. falta alguno de los archivos de `AI_FILES`;
 *   2. alguno no enlaza a `AGENTS.md` y a `CONTRIBUTING.md`;
 *   3. su bloque de reglas críticas no es IDÉNTICO al de `AGENTS.md`.
 *
 * Así una regla crítica nueva no puede quedar en un archivo y faltar en otro.
 * Para sumar otra IA: crear su archivo (con el bloque) y agregarlo a `AI_FILES`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Archivo de referencia: aquí vive el bloque original. */
const SOURCE = 'AGENTS.md';

/**
 * Archivos que cada herramienta lee por su cuenta (además de `AGENTS.md`, que
 * leen Codex, Cursor, Windsurf, el agente de Copilot y otras).
 */
const AI_FILES = [
  'CLAUDE.md', // Claude Code
  'GEMINI.md', // Gemini CLI y Gemini Code Assist
  '.github/copilot-instructions.md', // GitHub Copilot en el editor y en github.com
];

const START = '<!-- reglas-criticas:inicio';
const END = '<!-- reglas-criticas:fin -->';

/**
 * Saca el bloque de reglas críticas de un archivo.
 *
 * @param {string} text Contenido del archivo.
 * @returns {string | null} El bloque, desde el marcador de inicio hasta el de fin
 *   (incluidos), o `null` si falta alguno de los dos.
 * @example criticalBlock('a <!-- reglas-criticas:inicio --> x <!-- reglas-criticas:fin --> b')
 *   // '<!-- reglas-criticas:inicio --> x <!-- reglas-criticas:fin -->'
 */
export function criticalBlock(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  return text.slice(start, end + END.length);
}

/**
 * Lista los problemas de un archivo de IA comparado con el bloque original.
 *
 * @param {string} file Ruta desde la raíz del repositorio.
 * @param {string} expected Bloque de `AGENTS.md`.
 * @returns {string[]} Un mensaje por problema; vacío si está bien.
 */
function problemsOf(file, expected) {
  const path = join(ROOT, file);

  if (!existsSync(path)) {
    return [`${file}: no existe. Créelo con el enlace a AGENTS.md y el bloque de reglas.`];
  }

  const text = readFileSync(path, 'utf8');
  const problems = [];

  for (const target of ['AGENTS.md', 'CONTRIBUTING.md']) {
    if (!text.includes(`${target})`)) {
      problems.push(`${file}: no enlaza a ${target}.`);
    }
  }

  const block = criticalBlock(text);

  if (block === null) {
    problems.push(`${file}: le falta el bloque de reglas críticas (copie el de AGENTS.md).`);
  } else if (block !== expected) {
    problems.push(`${file}: su bloque de reglas críticas no es igual al de AGENTS.md.`);
  }

  return problems;
}

const expected = criticalBlock(readFileSync(join(ROOT, SOURCE), 'utf8'));

if (expected === null) {
  console.error(`${SOURCE}: le faltan los marcadores del bloque de reglas críticas.`);
  process.exit(1);
}

const problems = AI_FILES.flatMap((file) => problemsOf(file, expected));

if (problems.length > 0) {
  console.error('Las reglas del equipo no llegan igual a todas las IA:');

  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }

  process.exit(1);
}

console.log(`Reglas para IA en orden: ${[SOURCE, ...AI_FILES].join(', ')}.`);
