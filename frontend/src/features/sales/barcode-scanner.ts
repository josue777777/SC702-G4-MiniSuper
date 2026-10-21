import { useEffect, useRef } from 'react';

/*
 * Adaptador de lector de código de barras (HU-06).
 * Un lector USB de ese tipo se comporta como un teclado rápido y termina con Enter por eso funciona
 */
export interface WedgeOptions {
  /** Largo mínimo para considerar un código (descarta teclas sueltas + Enter). */
  minLength: number;
  /** Pausa máxima entre teclas de una misma lectura. Un lector escribe en pocos ms. */
  maxGapMs: number;
}

export const DEFAULT_WEDGE_OPTIONS: WedgeOptions = { minLength: 4, maxGapMs: 80 };

/* Verifica el dígito de control del código */
export function hasValidGtinCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) {
    return true;
  }

  const payload = code.slice(0, -1);
  let sum = 0;

  for (let index = payload.length - 1, distanceFromRight = 0; index >= 0; index -= 1) {
    const digit = Number(payload[index]);
    sum += digit * (distanceFromRight % 2 === 0 ? 3 : 1);
    distanceFromRight += 1;
  }

  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}

/** Acumula teclas; `push` devuelve el código cuando llega el Enter de una ráfaga válida. */
export class WedgeBuffer {
  private buffer = '';
  private lastAt = 0;

  constructor(private readonly options: WedgeOptions = DEFAULT_WEDGE_OPTIONS) {}

  push(key: string, now: number): string | null {
    if (key === 'Enter') {
      const code = this.buffer;

      this.buffer = '';

      if (code.length === 0) {
        return null;
      }

      return code.length >= this.options.minLength ? code : '';
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
