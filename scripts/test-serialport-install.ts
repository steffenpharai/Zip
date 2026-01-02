/**
 * Test script to verify serialport installation and native bindings
 */

async function testSerialPort() {
  console.log("Testing SerialPort installation...\n");

  // Check if we're in Node.js environment
  if (typeof window !== "undefined") {
    console.log("❌ This script must run in Node.js, not in a browser");
    process.exit(1);
  }

  try {
    console.log("1. Importing serialport module...");
    const serialport = await import("serialport");
    console.log("   ✓ serialport module imported successfully");

    console.log("\n2. Checking SerialPort class...");
    if (serialport.SerialPort) {
      console.log("   ✓ SerialPort class available");
    } else {
      console.log("   ✗ SerialPort class not found");
      process.exit(1);
    }

    console.log("\n3. Checking ReadlineParser...");
    const parserModule = await import("@serialport/parser-readline");
    if (parserModule.ReadlineParser) {
      console.log("   ✓ ReadlineParser available");
    } else {
      console.log("   ✗ ReadlineParser not found");
      process.exit(1);
    }

    console.log("\n4. Listing available serial ports...");
    try {
      const ports = await serialport.SerialPort.list();
      console.log(`   ✓ Found ${ports.length} serial port(s):`);
      if (ports.length === 0) {
        console.log("   ⚠ No serial ports found. Connect your Arduino via USB.");
      } else {
        ports.forEach((port, index) => {
          console.log(`   ${index + 1}. ${port.path}`);
          if (port.manufacturer) {
            console.log(`      Manufacturer: ${port.manufacturer}`);
          }
          if (port.vendorId && port.productId) {
            console.log(`      VID: ${port.vendorId}, PID: ${port.productId}`);
          }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`   ✗ Error listing ports: ${errorMessage}`);
      console.log("\n   This might indicate:");
      console.log("   - Native bindings not compiled correctly");
      console.log("   - Missing system dependencies (Windows: Visual Studio Build Tools)");
      console.log("   - Permission issues");
      process.exit(1);
    }

    console.log("\n✅ SerialPort installation is working correctly!");
    console.log("\nNext steps:");
    console.log("1. Connect your Arduino via USB");
    console.log("2. Set ROBOT_SERIAL_PORT in .env (or let it auto-detect)");
    console.log("3. Restart the Next.js dev server");
    console.log("4. Check the Robot Status panel in the Zip UI");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error:", errorMessage);
    
    if (errorMessage.includes("Cannot find module")) {
      console.log("\n💡 Solution:");
      console.log("   npm install serialport@^12.0.0 @serialport/parser-readline@^13.0.0");
    } else if (errorMessage.includes("native") || errorMessage.includes("binding")) {
      console.log("\n💡 Solution:");
      console.log("   npm rebuild serialport");
      console.log("   If that doesn't work, you may need:");
      console.log("   - Windows: Visual Studio Build Tools or Windows SDK");
      console.log("   - Python 3.x (for node-gyp)");
    }
    
    process.exit(1);
  }
}

testSerialPort().catch(console.error);

