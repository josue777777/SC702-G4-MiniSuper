import { useEffect, useState } from 'react';

interface InvoicePreviewProps {
  /** El archivo elegido o el que trajo el servidor. */
  file: Blob;
  /** Nombre para el título del visor y la descarga. */
  name: string;
}

/**
 * Muestra la factura del proveedor (HU-38) dentro de la ventana: un PDF en el
 * visor del navegador y una imagen tal cual. Así se va leyendo la factura
 * mientras se anotan las cantidades que llegaron.
 *
 * El archivo se muestra desde una dirección temporal del navegador
 * (`URL.createObjectURL`), que se libera al cerrar: no se vuelve a pedir al
 * servidor ni queda en memoria.
 */
export function InvoicePreview({ file, name }: InvoicePreviewProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);

    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (url === null) {
    return null;
  }

  return (
    <figure className="invoice-preview" aria-label="Factura del proveedor">
      {file.type === 'application/pdf' ? (
        <iframe className="invoice-preview__frame" src={url} title={`Factura: ${name}`} />
      ) : (
        <img className="invoice-preview__image" src={url} alt={`Factura: ${name}`} />
      )}
      <figcaption className="muted hint">
        {name} ·{' '}
        <a href={url} download={name}>
          Descargar
        </a>
      </figcaption>
    </figure>
  );
}
