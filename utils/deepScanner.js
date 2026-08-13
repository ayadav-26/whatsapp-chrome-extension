/**
 * WhatsApp Web Media Downloader - Deep Scan Engine
 * Namespace: window.WAMonitor.DeepScanner
 *
 * Implements aggressive progressive scrolling (5 passes x 10 micro-scroll steps)
 * with synthetic DOM scroll event dispatching to trigger WhatsApp Web's built-in message loader.
 */

window.WAMonitor = window.WAMonitor || {};

window.WAMonitor.DeepScanner = {
  isScanning: false,
  cancelScan: false,

  /**
   * Finds the active scroll container inside #main
   */
  getScrollContainer: function () {
    const main = document.querySelector("#main");
    if (!main) return null;

    const candidates = [
      main.querySelector("div[tabindex='-1']"),
      main.querySelector(".copyable-area > div:nth-child(2)"),
      main.querySelector("div._am9l"),
      main.querySelector("div._aj33"),
      main.querySelector("div[role='region']")
    ];

    for (const c of candidates) {
      if (c && c.scrollHeight > c.clientHeight && c.scrollTop !== undefined) {
        return c;
      }
    }

    let best = null;
    let bestHeight = 0;
    const allDivs = main.querySelectorAll("div");
    for (const d of allDivs) {
      if (d.scrollHeight > d.clientHeight && d.clientHeight > 150 &&
          window.getComputedStyle(d).overflowY !== "hidden" && d.scrollHeight > bestHeight) {
        best = d;
        bestHeight = d.scrollHeight;
      }
    }
    return best;
  },

  /**
   * Dispatches a synthetic scroll event on container to awaken virtual list listeners
   */
  triggerScrollEvent: function (container) {
    if (!container) return;
    try {
      container.dispatchEvent(new CustomEvent("scroll", { bubbles: true, cancelable: true }));
      container.dispatchEvent(new Event("scroll", { bubbles: true }));
    } catch (_) {}
  },

  /**
   * Starts multi-pass aggressive progressive deep scan
   */
  start: function (options = {}, onProgress, onComplete) {
    if (this.isScanning) {
      if (typeof onComplete === "function") onComplete({ success: false, reason: "Scan already in progress." });
      return;
    }

    const container = this.getScrollContainer();
    if (!container) {
      if (typeof onComplete === "function") onComplete({ success: false, reason: "Active chat scroll container not found." });
      return;
    }

    this.isScanning = true;
    this.cancelScan = false;

    const totalRounds = options.totalRounds || 5;
    const stepsPerRound = 10;
    const stepDelayMs = 250;
    const roundWaitMs = 1200;

    let currentRound = 0;

    const log = (msg) => {
      console.log(`[WA DeepScan] ${new Date().toLocaleTimeString()} - ${msg}`);
      if (window.WAMonitor?.Helpers) window.WAMonitor.Helpers.log(msg);
    };

    log(`Starting Deep Scan: ${totalRounds} passes... Container scrollHeight=${container.scrollHeight}, clientHeight=${container.clientHeight}`);

    const runRound = () => {
      if (this.cancelScan || currentRound >= totalRounds) {
        this.isScanning = false;
        log(`Deep Scan completed (${currentRound}/${totalRounds} passes).`);
        if (typeof onComplete === "function") {
          onComplete({ success: true, roundsCompleted: currentRound, cancelled: this.cancelScan });
        }
        return;
      }

      currentRound++;
      log(`[${currentRound}/${totalRounds}] Starting aggressive progressive scroll pass...`);

      let currentStep = 0;
      const initialScrollTop = container.scrollTop;

      const doStep = () => {
        if (this.cancelScan || currentStep >= stepsPerRound) {
          // Round finished — scroll to top to ensure top loader is triggered
          container.scrollTop = 0;
          this.triggerScrollEvent(container);

          const percent = Math.round((currentRound / totalRounds) * 100);
          if (typeof onProgress === "function") {
            onProgress({
              round: currentRound,
              totalRounds: totalRounds,
              percent: percent,
              status: `[${currentRound}/${totalRounds}] Progressive scroll completed`
            });
          }

          log(`[${currentRound}/${totalRounds}] Completed. Waiting for messages to load...`);

          // Pause between rounds to allow WhatsApp Web to fetch & render new messages
          setTimeout(() => {
            runRound();
          }, roundWaitMs);
          return;
        }

        currentStep++;
        const targetTop = Math.max(0, container.scrollTop - 500);
        container.scrollTop = targetTop;
        this.triggerScrollEvent(container);

        log(`Scroll step ${currentStep}/${stepsPerRound}: scrollTop=${container.scrollTop}`);

        const stepPercent = Math.round((((currentRound - 1) * stepsPerRound + currentStep) / (totalRounds * stepsPerRound)) * 100);
        if (typeof onProgress === "function") {
          onProgress({
            round: currentRound,
            totalRounds: totalRounds,
            step: currentStep,
            stepsPerRound: stepsPerRound,
            percent: stepPercent,
            scrollTop: container.scrollTop
          });
        }

        setTimeout(doStep, stepDelayMs);
      };

      doStep();
    };

    runRound();
  },

  /**
   * Stops an active deep scan
   */
  stop: function () {
    if (this.isScanning) {
      this.cancelScan = true;
      this.isScanning = false;
    }
  }
};
