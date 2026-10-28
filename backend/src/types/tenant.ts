/**
 * Multi-negocio (ADR 0002): cada petición trabaja con repositorios «atados» al
 * negocio de la sesión. Esta fábrica arma el de un negocio; las rutas la
 * reciben para poder usar repositorios falsos en las pruebas.
 */
export type ForBusiness<T> = (businessId: string) => T;
