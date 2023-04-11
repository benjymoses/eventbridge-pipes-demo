import * as dotenv from "dotenv";
dotenv.config();

type pipesDemoConfig = {
  notificationEmail: string;
  tableName: string;
};

export let config: pipesDemoConfig = {
  notificationEmail: process.env.NOTIFICATION_EMAIL || "nowhere@example.com",
  tableName: process.env.TABLE_NAME || "insert-table-name-here",
};
