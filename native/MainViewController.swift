import UIKit
import Capacitor

/// Compiling a plugin into the app is not the same as registering it.
///
/// Capacitor is supposed to find plugins by scanning the runtime, but a class
/// nothing ever references can be missed, and then every call from JavaScript
/// comes back as `"PedroNative" plugin is not implemented on ios` - which is
/// exactly what happened. Registering it here is explicit and cannot be missed:
/// `capacitorDidLoad` runs before the web app makes its first call.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PedroNative())
    }
}
