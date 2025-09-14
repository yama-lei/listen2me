/**
 * 时间工具类
 * 处理时区转换和格式化
 */
class TimeUtils {
    /**
     * 获取当前北京时间
     * @returns {Date} 北京时间
     */
    static getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Shanghai"}));
    }

    /**
     * 获取当前北京时间的ISO字符串
     * @returns {string} 北京时间的ISO字符串
     */
    static getBeijingTimeISO() {
        return this.getBeijingTime().toISOString();
    }

    /**
     * 获取当前北京时间的格式化字符串
     * @param {string} format 格式，默认为 'YYYY-MM-DD HH:mm:ss'
     * @returns {string} 格式化的时间字符串
     */
    static getBeijingTimeString(format = 'YYYY-MM-DD HH:mm:ss') {
        const beijingTime = this.getBeijingTime();
        const year = beijingTime.getFullYear();
        const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
        const day = String(beijingTime.getDate()).padStart(2, '0');
        const hours = String(beijingTime.getHours()).padStart(2, '0');
        const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
        const seconds = String(beijingTime.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }

    /**
     * 将Unix时间戳转换为北京时间字符串
     * @param {number} timestamp Unix时间戳
     * @param {string} format 格式，默认为 'YYYY-MM-DD HH:mm:ss'
     * @returns {string} 格式化的时间字符串
     */
    static timestampToBeijingString(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
        const date = new Date(timestamp * 1000);
        const beijingDate = new Date(date.toLocaleString("en-US", {timeZone: "Asia/Shanghai"}));
        
        const year = beijingDate.getFullYear();
        const month = String(beijingDate.getMonth() + 1).padStart(2, '0');
        const day = String(beijingDate.getDate()).padStart(2, '0');
        const hours = String(beijingDate.getHours()).padStart(2, '0');
        const minutes = String(beijingDate.getMinutes()).padStart(2, '0');
        const seconds = String(beijingDate.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }

    /**
     * 将北京时间字符串转换为Unix时间戳
     * @param {string} timeString 时间字符串 (YYYY-MM-DD HH:mm:ss)
     * @returns {number} Unix时间戳
     */
    static beijingStringToTimestamp(timeString) {
        // 假设输入的时间字符串是北京时间
        const date = new Date(timeString);
        return Math.floor(date.getTime() / 1000);
    }

    /**
     * 检查时间是否已过期（基于北京时间）
     * @param {string|Date} dueDate 截止时间
     * @returns {boolean} 是否已过期
     */
    static isExpired(dueDate) {
        if (!dueDate) return false;
        
        const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
        const now = this.getBeijingTime();
        
        return due < now;
    }

    /**
     * 获取当前北京时间的Unix时间戳
     * @returns {number} Unix时间戳
     */
    static getBeijingTimestamp() {
        return Math.floor(this.getBeijingTime().getTime() / 1000);
    }
}

module.exports = TimeUtils;
