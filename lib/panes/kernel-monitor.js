/** @babel */

import { CompositeDisposable } from "atom"
import { KERNEL_MONITOR_URI } from "../utils"
import { KernelMonitor } from "../components/kernel-monitor"

export default class KernelMonitorPane {
  element = document.createElement("div")
  disposer = new CompositeDisposable()

  constructor(store) {
    this.element.classList.add("hydrogen-next")
    this.monitor = new KernelMonitor(store)
    this.element.appendChild(this.monitor.element)
  }

  getTitle = () => "Kernel Monitor"
  getURI = () => KERNEL_MONITOR_URI
  getDefaultLocation = () => "bottom"
  getAllowedLocations = () => ["bottom", "left", "right"]

  destroy() {
    this.monitor.destroy()
    this.disposer.dispose()
    this.element.remove()
  }
}
