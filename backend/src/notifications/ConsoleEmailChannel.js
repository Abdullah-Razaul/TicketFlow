import { NotificationChannel } from './NotificationChannel.js';
export class ConsoleEmailChannel extends NotificationChannel {
  async send(notification) { console.info('[EMAIL MOCK]', notification); }
}
