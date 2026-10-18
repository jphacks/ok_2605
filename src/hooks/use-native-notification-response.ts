import * as Notifications from 'expo-notifications';

export function useNativeNotificationResponse() {
  return Notifications.useLastNotificationResponse();
}
