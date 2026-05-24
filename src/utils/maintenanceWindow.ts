export type MaintenanceNoticeState = {
  showBanner: boolean;
  urgent: boolean;
  message: string;
  showFromAt: Date | null;
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
  maintenanceNoticeShowFromAt?: string | null;
  maintenanceWindowStartAt?: string | null;
  maintenanceWindowEndAt?: string | null;
}): MaintenanceNoticeState => {
  const now = new Date();
  const showFromAt = parseDate(settings?.maintenanceNoticeShowFromAt);
  const startsAt = parseDate(settings?.maintenanceWindowStartAt);
  const endsAt = parseDate(settings?.maintenanceWindowEndAt);

  const activeWindow =
    !!startsAt &&
    !!endsAt &&
    now.getTime() >= startsAt.getTime() &&
    now.getTime() <= endsAt.getTime();

  const showBanner =
    Boolean(settings?.maintenanceNoticeEnabled) &&
    !!showFromAt &&
    !!startsAt &&
    !activeWindow &&
    now.getTime() >= showFromAt.getTime() &&
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
    showFromAt,
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
  const now = new Date();
  const startsAt = parseDate(settings?.maintenanceWindowStartAt);
  const endsAt = parseDate(settings?.maintenanceWindowEndAt);

  if (endsAt && now.getTime() > endsAt.getTime()) return false;
  if (Boolean(settings?.maintenanceMode)) return true;
  if (!startsAt) return false;
  if (now.getTime() < startsAt.getTime()) return false;
  if (!endsAt) return true;
  return now.getTime() <= endsAt.getTime();
};
