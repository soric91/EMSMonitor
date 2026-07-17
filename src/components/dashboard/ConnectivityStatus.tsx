import { useEffect, useState } from 'react';
import { getDashboardStatus } from '../../api/dashboard';
import type { DashboardStatus } from '../../api/types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { formatLocalDateTime } from '../../utils/format';

export function ConnectivityStatus() {
  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDashboardStatus()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar el estado del sistema.</Card>;
  }

  if (!status) {
    return (
      <Card className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Estado del sistema</p>
      <div className="flex flex-wrap gap-2">
        <Badge tone={status.mqtt_connected ? 'emerald' : 'red'}>
          MQTT {status.mqtt_connected ? 'conectado' : 'desconectado'}
        </Badge>
        <Badge tone={status.influx_connected ? 'emerald' : 'red'}>
          InfluxDB {status.influx_connected ? 'conectado' : 'desconectado'}
        </Badge>
        <Badge tone="slate">
          {status.devices_online}/{status.devices_total} dispositivos en línea
        </Badge>
      </div>
      {status.last_message_at && (
        <p className="text-xs text-slate-400">
          Último mensaje: {formatLocalDateTime(status.last_message_at)}
        </p>
      )}
    </Card>
  );
}
