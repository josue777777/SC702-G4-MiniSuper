import { useSetupStatus } from '../features/auth/setup-status-context';
import { SetupForm } from '../features/auth/SetupForm';

/** Configuración inicial de la cuenta única del dueño (HU-12). Solo existe mientras no haya cuenta. */
export function SetupPage() {
  const { status, markConfigured } = useSetupStatus();

  return (
    <div className="login">
      {/* Al crear la cuenta, <SetupGate /> redirige al login. */}
      <SetupForm tokenRequired={status.tokenRequired} onDone={markConfigured} />
    </div>
  );
}
