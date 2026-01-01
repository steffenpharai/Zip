/**
 * CRC16-CCITT Implementation
 * Polynomial: 0x1021
 * Initial value: 0xFFFF
 * This matches the firmware implementation
 */
const POLYNOMIAL = 0x1021;
let crcTable = null;
function initTable() {
    if (crcTable) {
        return crcTable;
    }
    crcTable = new Uint16Array(256);
    for (let i = 0; i < 256; i++) {
        let crc = (i << 8) & 0xFFFF;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ POLYNOMIAL) & 0xFFFF;
            }
            else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
        crcTable[i] = crc;
    }
    return crcTable;
}
export function calculateCRC16(data) {
    const table = initTable();
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        const index = ((crc >> 8) ^ data[i]) & 0xFF;
        crc = ((crc << 8) ^ table[index]) & 0xFFFF;
    }
    return crc;
}
//# sourceMappingURL=crc16.js.map