type MaintenanceNoticeState = {
  showBanner: boolean;
  urgent: boolean;
  message: string;
  startsAt: Date | null;
  endsAt: Date | null;
  activeWindow: boolean;
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

export const getMaintenanceNoticeState = (settings: {
  maintenanceNoticeEnabled?: boolean;
  maintenanceNoticeMessage?: string;
  maintenanceWindowStartAt?: string | null;
  maintenanceWindowEndAt?: string | null;
}): MaintenanceNoticeState => {
  const now = new Date();
  const startsAt = parseDate(settings?.maintenanceWindowStartAt);
  const endsAt = parseDate(settings?.maintenanceWindowEndAt);

  const activeWindow =
    !!startsAt &&
    !!endsAt &&
    now.getTime() >= startsAt.getTime() &&
    now.getTime() <= endsAt.getTime();

  const showBanner =
    Boolean(settings?.maintenanceNoticeEnabled) &&
    !!startsAt &&
    !activeWindow &&
    now.getTime() < startsAt.getTime();

  const urgent =
    showBanner &&
    !!startsAt &&
    startsAt.getTime() - now.getTime() <= 15 * 60 * 1000;

  const message = String(settings?.maintenanceNoticeMessage || '').trim();

  return {
    showBanner,
    urgent,
    message,
    startsAt,
    endsAt,
    activeWindow,
  };
};

export const isMaintenanceActiveNow = (settings: {
  maintenanceMode?: boolean;
  maintenanceWindowStartAt?: string | null;
  maintenanceWindowEndAt?: string | null;
}): boolean => {
  if (Boolean(settings?.maintenanceMode)) return true;
  const now = new Date();
  const startsAt = parseDate(settings?.maintenanceWindowStartAt);
  const endsAt = parseDate(settings?.maintenanceWindowEndAt);
  if (!startsAt || !endsAt) return false;
  return now.getTime() >= startsAt.getTime() && now.getTime() <= endsAt.getTime();
};

