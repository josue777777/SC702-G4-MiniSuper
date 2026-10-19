import { useEffect, useRef } from 'react';

/**
 * Adaptador de lector de código de barras "keyboard wedge" (HU-16).
 *
 * Un lector USB de ese tipo se comporta como un teclado: «teclea» el código muy
 * rápido y termina con Enter. Este adaptador distingue esa ráfaga de una persona
 * escribiendo por la velocidad entre teclas, y entrega el código completo.
 *
 * Es independiente de la pantalla de ventas a propósito: HU-06 (reconocer el
 * código leído para cargar un producto) puede reutilizarlo tal cual con otro
 * `onScan`, sin tocar el POS. NO se ha probado con un lector físico: solo con
 * escritura simulada del navegador (ver docs en el reporte del sprint).
 */
export interface WedgeOptions {
  /** Largo mínimo para considerar un código (descarta teclas sueltas + Enter). */
  minLength: number;
  /** Pausa máxima entre teclas de una misma lectura. Un lector escribe en pocos ms. */
  maxGapMs: number;
}

export const DEFAULT_WEDGE_OPTIONS: WedgeOptions = { minLength: 4, maxGapMs: 80 };

/** Acumula teclas; `push` devuelve el código cuando llega el Enter de una ráfaga válida. */
export class WedgeBuffer {
  private buffer = '';
  private lastAt = 0;

  constructor(private readonly options: WedgeOptions = DEFAULT_WEDGE_OPTIONS) {}

  push(key: string, now: number): string | null {
    if (key === 'Enter') {
      const code = this.buffer;

      this.buffer = '';

      return code.length >= this.options.minLength ? code : null;
    }

    if (key.length !== 1) {
      return null;
    }

    // Una pausa larga significa que es una persona tecleando: empieza de nuevo.
    if (now - this.lastAt > this.options.maxGapMs) {
      this.buffer = '';
    }

    this.buffer += key;
    this.lastAt = now;

    return null;
  }
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Escucha la ráfaga del lector en toda la pantalla, salvo cuando el foco está
 * en un campo de texto (ahí el propio campo recibe el código y su formulario lo
 * procesa con Enter).
 */
export function useWedgeScanner(onScan: (code: string) => void, enabled = true): void {
  const handler = useRef(onScan);

  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const buffer = new WedgeBuffer();

    function onKeyDown(event: KeyboardEvent): void {
      if (isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const code = buffer.push(event.key, event.timeStamp);

      if (code !== null) {
        // Evita que el Enter del lector active el botón que tenga el foco.
        event.preventDefault();
        handler.current(code);
      }
    }

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
