import NotificationService from "./notificationService.js";
class StatusService {
	/**
	 * Creates an instance of StatusService.
	 *
	 * @param {Object} db - The database instance.
	 * @param {Object} logger - The logger instance.
	 * @param {NotificationService} notificationService
	 */
	constructor(db, logger,notificationService) {
		this.db = db;
		this.logger = logger;
		this.notificationService = notificationService; 
		this.SERVICE_NAME = "StatusService";
	}

	/**
	 * Updates the status of a monitor based on the network response.
	 *
	 * @param {Object} networkResponse - The network response containing monitorId and status.
	 * @param {string} networkResponse.monitorId - The ID of the monitor.
	 * @param {string} networkResponse.status - The new status of the monitor.
	 * @returns {Promise<Object>} - A promise that resolves to an object containing the monitor, statusChanged flag, and previous status if the status changed, or false if an error occurred.
	 * @returns {Promise<Object>} returnObject - The object returned by the function.
	 * @returns {Object} returnObject.monitor - The monitor object.
	 * @returns {boolean} returnObject.statusChanged - Flag indicating if the status has changed.
	 * @returns {boolean} returnObject.prevStatus - The previous status of the monitor
	 */
	updateStatus = async (networkResponse) => {
		this.insertCheck(networkResponse);
		try {
			const { monitorId, status } = networkResponse;
			const monitor = await this.db.getMonitorById(monitorId);			
			// No change in monitor status, return early
			if (monitor.status === status) return { statusChanged: false };
			// Monitor status changed, save prev status and update monitor

			this.logger.info({
				service: this.SERVICE_NAME,
				message: `${monitor.name} went from ${monitor.status === true ? "up" : "down"} to ${status === true ? "up" : "down"}`,
				prevStatus: monitor.status,
				newStatus: status,
			});

			const prevStatus = monitor.status;
			monitor.status = status;
			await monitor.save();

			const users = await this.db.getAllUsers();


			if (users.length > 0) {
    			const address = users[0].email;
    			
			} else {
    			console.log('No users found.');
			}

			if (status === false) {
				const prevStatus2 = monitor.status;
				
				
				// Extract email address from the notifications array
				const emailNotification = monitor.notifications.find(notification => notification.type === 'email');
				const address = emailNotification ? emailNotification.address : undefined;
			
				
			
				if (address) {
					await this.notificationService.sendEmail({ monitor, status, prevStatus2 }, address);
				} else {
					console.error('No email address found in notifications.');
				}
			}
			


			return {
				monitor,
				statusChanged: true,
				prevStatus: prevStatus,
			};
			//
		} catch (error) {
			this.logger.error({
				service: this.SERVICE_NAME,
				message: error.message,
				method: "updateStatus",
				stack: error.stack,
			});
			throw error;
		}
	};	

	/**
	 * Builds a check object from the network response.
	 *
	 * @param {Object} networkResponse - The network response object.
	 * @param {string} networkResponse.monitorId - The monitor ID.
	 * @param {string} networkResponse.type - The type of the response.
	 * @param {string} networkResponse.status - The status of the response.
	 * @param {number} networkResponse.responseTime - The response time.
	 * @param {number} networkResponse.code - The status code.
	 * @param {string} networkResponse.message - The message.
	 * @param {Object} networkResponse.payload - The payload of the response.
	 * @returns {Object} The check object.
	 */
	buildCheck = (networkResponse) => {
		const { monitorId, type, status, responseTime, code, message, payload } =
			networkResponse;
		const check = {
			monitorId,
			status,
			statusCode: code,
			responseTime,
			message,
		};
		if (type === "pagespeed") {
			const categories = payload.lighthouseResult?.categories;
			const audits = payload.lighthouseResult?.audits;
			const {
				"cumulative-layout-shift": cls = 0,
				"speed-index": si = 0,
				"first-contentful-paint": fcp = 0,
				"largest-contentful-paint": lcp = 0,
				"total-blocking-time": tbt = 0,
			} = audits;
			check.accessibility = (categories.accessibility?.score || 0) * 100;
			check.bestPractices = (categories["best-practices"]?.score || 0) * 100;
			check.seo = (categories.seo?.score || 0) * 100;
			check.performance = (categories.performance?.score || 0) * 100;
			check.audits = { cls, si, fcp, lcp, tbt };
		}

		if (type === "hardware") {
			check.cpu = payload?.cpu ?? {};
			check.memory = payload?.memory ?? {};
			check.disk = payload?.disk ?? {};
			check.host = payload?.host ?? {};
		}
		return check;
	};

	/**
	 * Inserts a check into the database based on the network response.
	 *
	 * @param {Object} networkResponse - The network response object.
	 * @param {string} networkResponse.monitorId - The monitor ID.
	 * @param {string} networkResponse.type - The type of the response.
	 * @param {string} networkResponse.status - The status of the response.
	 * @param {number} networkResponse.responseTime - The response time.
	 * @param {number} networkResponse.code - The status code.
	 * @param {string} networkResponse.message - The message.
	 * @param {Object} networkResponse.payload - The payload of the response.
	 * @returns {Promise<void>} A promise that resolves when the check is inserted.
	 */
	insertCheck = async (networkResponse) => {
		try {
			const operationMap = {
				http: this.db.createCheck,
				ping: this.db.createCheck,
				pagespeed: this.db.createPageSpeedCheck,
				hardware: this.db.createHardwareCheck,
			};
			const operation = operationMap[networkResponse.type];
			const check = this.buildCheck(networkResponse);
			await operation(check);
		} catch (error) {
			this.logger.error({
				message: error.message,
				service: this.SERVICE_NAME,
				method: "insertCheck",
				details: `Error inserting check for monitor: ${networkResponse?.monitorId}`,
				stack: error.stack,
			});
		}
	};
}
export default StatusService;
