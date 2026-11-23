import { NotificationChannel } from './NotificationChannel.js';
export class InAppChannel extends NotificationChannel {
  constructor(repository) { super(); this.repository = repository; }
  async send(notification) { return this.repository.create(notification); }
}
