import { config } from "dotenv";
config({ path: ".env.local" });
import { Membership } from "./database/models";

async function run() {
  try {
    await Membership.destroy({ where: {} });
    console.log("All memberships deleted successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error deleting memberships:", err);
    process.exit(1);
  }
}

run();
