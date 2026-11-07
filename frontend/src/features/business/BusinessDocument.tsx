import type { ReactNode } from 'react';
import { businessService } from '../../services/business.service';
import type { Business } from '../../types/business';
import { formatDateTime } from '../inventory/inventory-count';
import { useBusiness } from './business-context';

/**
 * Encabezado y pie de los documentos del negocio que se imprimen o guardan en
 * PDF (por ejemplo, el pedido a proveedor). Llevan los datos de Configuración ›
 * General: logo, nombre, cédula, teléfono, correo y dirección. Un solo
 * componente para que todos los documentos del negocio se vean igual.
 *
 * Solo salen en el papel (`print-only`): en pantalla ya se ve el negocio en la
 * barra superior.
 */

/** «Céd. 3-101-123456 · Tel. 2222-0000 · ventas@… · San José»: lo que haya. */
export function businessContactLine(business: Business): string {
  return [
    business.legalId === null ? null : `Céd. ${business.legalId}`,
    business.phone === null ? null : `Tel. ${business.phone}`,
    business.email,
    business.address,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

interface BusinessDocumentHeaderProps {
  /** Qué documento es, p. ej. «Pedido a proveedor PED-0007». */
  title: string;
  /** Datos del documento a la derecha (número, fecha…). */
  children?: ReactNode;
}

export function BusinessDocumentHeader({ title, children }: BusinessDocumentHeaderProps) {
  const { business } = useBusiness();
  const contact = businessContactLine(business);

  return (
    <header className="print-only business-document__header">
      <div className="business-document__brand">
        {business.logoUrl === null ? null : (
          <img
            className="business-logo business-document__logo"
            src={businessService.logoSrc(business.logoUrl)}
            alt=""
          />
        )}
        <div>
          <strong className="business-document__name">{business.name}</strong>
          {contact === '' ? null : <span className="business-document__contact">{contact}</span>}
        </div>
      </div>
      <div className="business-document__title">
        <h1>{title}</h1>
        {children}
      </div>
    </header>
  );
}

interface BusinessDocumentFooterProps {
  /** Quién generó el documento (el usuario de la sesión). */
  generatedBy: string;
  /** Cuándo; por defecto, ahora. */
  generatedAt?: Date;
}

export function BusinessDocumentFooter({
  generatedBy,
  generatedAt = new Date(),
}: BusinessDocumentFooterProps) {
  const { business } = useBusiness();
  const contact = businessContactLine(business);

  return (
    <footer className="print-only business-document__footer">
      <span>
        {business.name}
        {contact === '' ? '' : ` · ${contact}`}
      </span>
      <span>
        Generado por {generatedBy} el {formatDateTime(generatedAt.toISOString())}
      </span>
    </footer>
  );
}
