/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the W3C SOFTWARE AND DOCUMENT NOTICE AND LICENSE.
 *
 *  https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document
 *
 */

(function(window, document) {
  'use strict';


// Exits early if all IntersectionObserver and IntersectionObserverEntry
// features are natively supported.
  if ('IntersectionObserver' in window &&
    'IntersectionObserverEntry' in window &&
    'intersectionRatio' in window.IntersectionObserverEntry.prototype) {

    // Minimal polyfill for Edge 15's lack of `isIntersecting`
    // See: https://github.com/w3c/IntersectionObserver/issues/211
    if (!('isIntersecting' in window.IntersectionObserverEntry.prototype)) {
      Object.defineProperty(window.IntersectionObserverEntry.prototype,
        'isIntersecting', {
          get: function () {
            return this.intersectionRatio > 0;
          }
        });
    }
    return;
  }


  /**
   * An IntersectionObserver registry. This registry exists to hold a strong
   * reference to IntersectionObserver instances currently observering a target
   * element. Without this registry, instances without another reference may be
   * garbage collected.
   */
  var registry = [];


  /**
   * Creates the global IntersectionObserverEntry constructor.
   * https://w3c.github.io/IntersectionObserver/#intersection-observer-entry
   * @param {Object} entry A dictionary of instance properties.
   * @constructor
   */
  function IntersectionObserverEntry(entry) {
    this.time = entry.time;
    this.target = entry.target;
    this.rootBounds = entry.rootBounds;
    this.boundingClientRect = entry.boundingClientRect;
    this.intersectionRect = entry.intersectionRect || getEmptyRect();
    this.isIntersecting = !!entry.intersectionRect;

    // Calculates the intersection ratio.
    var targetRect = this.boundingClientRect;
    var targetArea = targetRect.width * targetRect.height;
    var intersectionRect = this.intersectionRect;
    var intersectionArea = intersectionRect.width * intersectionRect.height;

    // Sets intersection ratio.
    if (targetArea) {
      this.intersectionRatio = intersectionArea / targetArea;
    } else {
      // If area is zero and is intersecting, sets to 1, otherwise to 0
      this.intersectionRatio = this.isIntersecting ? 1 : 0;
    }
  }


  /**
   * Creates the global IntersectionObserver constructor.
   * https://w3c.github.io/IntersectionObserver/#intersection-observer-interface
   * @param {Function} callback The function to be invoked after intersection
   *     changes have queued. The function is not invoked if the queue has
   *     been emptied by calling the `takeRecords` method.
   * @param {Object=} opt_options Optional configuration options.
   * @constructor
   */
  function IntersectionObserver(callback, opt_options) {

    var options = opt_options || {};

    if (typeof callback != 'function') {
      throw new Error('callback must be a function');
    }

    if (options.root && options.root.nodeType != 1) {
      throw new Error('root must be an Element');
    }

    // Binds and throttles `this._checkForIntersections`.
    this._checkForIntersections = throttle(
      this._checkForIntersections.bind(this), this.THROTTLE_TIMEOUT);

    // Private properties.
    this._callback = callback;
    this._observationTargets = [];
    this._queuedEntries = [];
    this._rootMarginValues = this._parseRootMargin(options.rootMargin);

    // Public properties.
    this.thresholds = this._initThresholds(options.threshold);
    this.root = options.root || null;
    this.rootMargin = this._rootMarginValues.map(function(margin) {
      return margin.value + margin.unit;
    }).join(' ');
  }


  /**
   * The minimum interval within which the document will be checked for
   * intersection changes.
   */
  IntersectionObserver.prototype.THROTTLE_TIMEOUT = 100;


  /**
   * The frequency in which the polyfill polls for intersection changes.
   * this can be updated on a per instance basis and must be set prior to
   * calling `observe` on the first target.
   */
  IntersectionObserver.prototype.POLL_INTERVAL = null;

  /**
   * Use a mutation observer on the root element
   * to detect intersection changes.
   */
  IntersectionObserver.prototype.USE_MUTATION_OBSERVER = true;


  /**
   * Starts observing a target element for intersection changes based on
   * the thresholds values.
   * @param {Element} target The DOM element to observe.
   */
  IntersectionObserver.prototype.observe = function(target) {
    var isTargetAlreadyObserved = this._observationTargets.some(function(item) {
      return item.element == target;
    });

    if (isTargetAlreadyObserved) {
      return;
    }

    if (!(target && target.nodeType == 1)) {
      throw new Error('target must be an Element');
    }

    this._registerInstance();
    this._observationTargets.push({element: target, entry: null});
    this._monitorIntersections();
    this._checkForIntersections();
  };


  /**
   * Stops observing a target element for intersection changes.
   * @param {Element} target The DOM element to observe.
   */
  IntersectionObserver.prototype.unobserve = function(target) {
    this._observationTargets =
      this._observationTargets.filter(function(item) {

        return item.element != target;
      });
    if (!this._observationTargets.length) {
      this._unmonitorIntersections();
      this._unregisterInstance();
    }
  };


  /**
   * Stops observing all target elements for intersection changes.
   */
  IntersectionObserver.prototype.disconnect = function() {
    this._observationTargets = [];
    this._unmonitorIntersections();
    this._unregisterInstance();
  };


  /**
   * Returns any queue entries that have not yet been reported to the
   * callback and clears the queue. This can be used in conjunction with the
   * callback to obtain the absolute most up-to-date intersection information.
   * @return {Array} The currently queued entries.
   */
  IntersectionObserver.prototype.takeRecords = function() {
    var records = this._queuedEntries.slice();
    this._queuedEntries = [];
    return records;
  };


  /**
   * Accepts the threshold value from the user configuration object and
   * returns a sorted array of unique threshold values. If a value is not
   * between 0 and 1 and error is thrown.
   * @private
   * @param {Array|number=} opt_threshold An optional threshold value or
   *     a list of threshold values, defaulting to [0].
   * @return {Array} A sorted list of unique and valid threshold values.
   */
  IntersectionObserver.prototype._initThresholds = function(opt_threshold) {
    var threshold = opt_threshold || [0];
    if (!Array.isArray(threshold)) threshold = [threshold];

    return threshold.sort().filter(function(t, i, a) {
      if (typeof t != 'number' || isNaN(t) || t < 0 || t > 1) {
        throw new Error('threshold must be a number between 0 and 1 inclusively');
      }
      return t !== a[i - 1];
    });
  };


  /**
   * Accepts the rootMargin value from the user configuration object
   * and returns an array of the four margin values as an object containing
   * the value and unit properties. If any of the values are not properly
   * formatted or use a unit other than px or %, and error is thrown.
   * @private
   * @param {string=} opt_rootMargin An optional rootMargin value,
   *     defaulting to '0px'.
   * @return {Array<Object>} An array of margin objects with the keys
   *     value and unit.
   */
  IntersectionObserver.prototype._parseRootMargin = function(opt_rootMargin) {
    var marginString = opt_rootMargin || '0px';
    var margins = marginString.split(/\s+/).map(function(margin) {
      var parts = /^(-?\d*\.?\d+)(px|%)$/.exec(margin);
      if (!parts) {
        throw new Error('rootMargin must be specified in pixels or percent');
      }
      return {value: parseFloat(parts[1]), unit: parts[2]};
    });

    // Handles shorthand.
    margins[1] = margins[1] || margins[0];
    margins[2] = margins[2] || margins[0];
    margins[3] = margins[3] || margins[1];

    return margins;
  };


  /**
   * Starts polling for intersection changes if the polling is not already
   * happening, and if the page's visibilty state is visible.
   * @private
   */
  IntersectionObserver.prototype._monitorIntersections = function() {
    if (!this._monitoringIntersections) {
      this._monitoringIntersections = true;

      // If a poll interval is set, use polling instead of listening to
      // resize and scroll events or DOM mutations.
      if (this.POLL_INTERVAL) {
        this._monitoringInterval = setInterval(
          this._checkForIntersections, this.POLL_INTERVAL);
      }
      else {
        addEvent(window, 'resize', this._checkForIntersections, true);
        addEvent(document, 'scroll', this._checkForIntersections, true);

        if (this.USE_MUTATION_OBSERVER && 'MutationObserver' in window) {
          this._domObserver = new MutationObserver(this._checkForIntersections);
          this._domObserver.observe(document, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true
          });
        }
      }
    }
  };


  /**
   * Stops polling for intersection changes.
   * @private
   */
  IntersectionObserver.prototype._unmonitorIntersections = function() {
    if (this._monitoringIntersections) {
      this._monitoringIntersections = false;

      clearInterval(this._monitoringInterval);
      this._monitoringInterval = null;

      removeEvent(window, 'resize', this._checkForIntersections, true);
      removeEvent(document, 'scroll', this._checkForIntersections, true);

      if (this._domObserver) {
        this._domObserver.disconnect();
        this._domObserver = null;
      }
    }
  };


  /**
   * Scans each observation target for intersection changes and adds them
   * to the internal entries queue. If new entries are found, it
   * schedules the callback to be invoked.
   * @private
   */
  IntersectionObserver.prototype._checkForIntersections = function() {
    var rootIsInDom = this._rootIsInDom();
    var rootRect = rootIsInDom ? this._getRootRect() : getEmptyRect();

    this._observationTargets.forEach(function(item) {
      var target = item.element;
      var targetRect = getBoundingClientRect(target);
      var rootContainsTarget = this._rootContainsTarget(target);
      var oldEntry = item.entry;
      var intersectionRect = rootIsInDom && rootContainsTarget &&
        this._computeTargetAndRootIntersection(target, rootRect);

      var newEntry = item.entry = new IntersectionObserverEntry({
        time: now(),
        target: target,
        boundingClientRect: targetRect,
        rootBounds: rootRect,
        intersectionRect: intersectionRect
      });

      if (!oldEntry) {
        this._queuedEntries.push(newEntry);
      } else if (rootIsInDom && rootContainsTarget) {
        // If the new entry intersection ratio has crossed any of the
        // thresholds, add a new entry.
        if (this._hasCrossedThreshold(oldEntry, newEntry)) {
          this._queuedEntries.push(newEntry);
        }
      } else {
        // If the root is not in the DOM or target is not contained within
        // root but the previous entry for this target had an intersection,
        // add a new record indicating removal.
        if (oldEntry && oldEntry.isIntersecting) {
          this._queuedEntries.push(newEntry);
        }
      }
    }, this);

    if (this._queuedEntries.length) {
      this._callback(this.takeRecords(), this);
    }
  };


  /**
   * Accepts a target and root rect computes the intersection between then
   * following the algorithm in the spec.
   * TODO(philipwalton): at this time clip-path is not considered.
   * https://w3c.github.io/IntersectionObserver/#calculate-intersection-rect-algo
   * @param {Element} target The target DOM element
   * @param {Object} rootRect The bounding rect of the root after being
   *     expanded by the rootMargin value.
   * @return {?Object} The final intersection rect object or undefined if no
   *     intersection is found.
   * @private
   */
  IntersectionObserver.prototype._computeTargetAndRootIntersection =
    function(target, rootRect) {

      // If the element isn't displayed, an intersection can't happen.
      if (window.getComputedStyle(target).display == 'none') return;

      var targetRect = getBoundingClientRect(target);
      var intersectionRect = targetRect;
      var parent = getParentNode(target);
      var atRoot = false;

      while (!atRoot) {
        var parentRect = null;
        var parentComputedStyle = parent.nodeType == 1 ?
          window.getComputedStyle(parent) : {};

        // If the parent isn't displayed, an intersection can't happen.
        if (parentComputedStyle.display == 'none') return;

        if (parent == this.root || parent == document) {
          atRoot = true;
          parentRect = rootRect;
        } else {
          // If the element has a non-visible overflow, and it's not the <body>
          // or <html> element, update the intersection rect.
          // Note: <body> and <html> cannot be clipped to a rect that's not also
          // the document rect, so no need to compute a new intersection.
          if (parent != document.body &&
            parent != document.documentElement &&
            parentComputedStyle.overflow != 'visible') {
            parentRect = getBoundingClientRect(parent);
          }
        }

        // If either of the above conditionals set a new parentRect,
        // calculate new intersection data.
        if (parentRect) {
          intersectionRect = computeRectIntersection(parentRect, intersectionRect);

          if (!intersectionRect) break;
        }
        parent = getParentNode(parent);
      }
      return intersectionRect;
    };


  /**
   * Returns the root rect after being expanded by the rootMargin value.
   * @return {Object} The expanded root rect.
   * @private
   */
  IntersectionObserver.prototype._getRootRect = function() {
    var rootRect;
    if (this.root) {
      rootRect = getBoundingClientRect(this.root);
    } else {
      // Use <html>/<body> instead of window since scroll bars affect size.
      var html = document.documentElement;
      var body = document.body;
      rootRect = {
        top: 0,
        left: 0,
        right: html.clientWidth || body.clientWidth,
        width: html.clientWidth || body.clientWidth,
        bottom: html.clientHeight || body.clientHeight,
        height: html.clientHeight || body.clientHeight
      };
    }
    return this._expandRectByRootMargin(rootRect);
  };


  /**
   * Accepts a rect and expands it by the rootMargin value.
   * @param {Object} rect The rect object to expand.
   * @return {Object} The expanded rect.
   * @private
   */
  IntersectionObserver.prototype._expandRectByRootMargin = function(rect) {
    var margins = this._rootMarginValues.map(function(margin, i) {
      return margin.unit == 'px' ? margin.value :
        margin.value * (i % 2 ? rect.width : rect.height) / 100;
    });
    var newRect = {
      top: rect.top - margins[0],
      right: rect.right + margins[1],
      bottom: rect.bottom + margins[2],
      left: rect.left - margins[3]
    };
    newRect.width = newRect.right - newRect.left;
    newRect.height = newRect.bottom - newRect.top;

    return newRect;
  };


  /**
   * Accepts an old and new entry and returns true if at least one of the
   * threshold values has been crossed.
   * @param {?IntersectionObserverEntry} oldEntry The previous entry for a
   *    particular target element or null if no previous entry exists.
   * @param {IntersectionObserverEntry} newEntry The current entry for a
   *    particular target element.
   * @return {boolean} Returns true if a any threshold has been crossed.
   * @private
   */
  IntersectionObserver.prototype._hasCrossedThreshold =
    function(oldEntry, newEntry) {

      // To make comparing easier, an entry that has a ratio of 0
      // but does not actually intersect is given a value of -1
      var oldRatio = oldEntry && oldEntry.isIntersecting ?
        oldEntry.intersectionRatio || 0 : -1;
      var newRatio = newEntry.isIntersecting ?
        newEntry.intersectionRatio || 0 : -1;

      // Ignore unchanged ratios
      if (oldRatio === newRatio) return;

      for (var i = 0; i < this.thresholds.length; i++) {
        var threshold = this.thresholds[i];

        // Return true if an entry matches a threshold or if the new ratio
        // and the old ratio are on the opposite sides of a threshold.
        if (threshold == oldRatio || threshold == newRatio ||
          threshold < oldRatio !== threshold < newRatio) {
          return true;
        }
      }
    };


  /**
   * Returns whether or not the root element is an element and is in the DOM.
   * @return {boolean} True if the root element is an element and is in the DOM.
   * @private
   */
  IntersectionObserver.prototype._rootIsInDom = function() {
    return !this.root || containsDeep(document, this.root);
  };


  /**
   * Returns whether or not the target element is a child of root.
   * @param {Element} target The target element to check.
   * @return {boolean} True if the target element is a child of root.
   * @private
   */
  IntersectionObserver.prototype._rootContainsTarget = function(target) {
    return containsDeep(this.root || document, target);
  };


  /**
   * Adds the instance to the global IntersectionObserver registry if it isn't
   * already present.
   * @private
   */
  IntersectionObserver.prototype._registerInstance = function() {
    if (registry.indexOf(this) < 0) {
      registry.push(this);
    }
  };


  /**
   * Removes the instance from the global IntersectionObserver registry.
   * @private
   */
  IntersectionObserver.prototype._unregisterInstance = function() {
    var index = registry.indexOf(this);
    if (index != -1) registry.splice(index, 1);
  };


  /**
   * Returns the result of the performance.now() method or null in browsers
   * that don't support the API.
   * @return {number} The elapsed time since the page was requested.
   */
  function now() {
    return window.performance && performance.now && performance.now();
  }


  /**
   * Throttles a function and delays its executiong, so it's only called at most
   * once within a given time period.
   * @param {Function} fn The function to throttle.
   * @param {number} timeout The amount of time that must pass before the
   *     function can be called again.
   * @return {Function} The throttled function.
   */
  function throttle(fn, timeout) {
    var timer = null;
    return function () {
      if (!timer) {
        timer = setTimeout(function() {
          fn();
          timer = null;
        }, timeout);
      }
    };
  }


  /**
   * Adds an event handler to a DOM node ensuring cross-browser compatibility.
   * @param {Node} node The DOM node to add the event handler to.
   * @param {string} event The event name.
   * @param {Function} fn The event handler to add.
   * @param {boolean} opt_useCapture Optionally adds the even to the capture
   *     phase. Note: this only works in modern browsers.
   */
  function addEvent(node, event, fn, opt_useCapture) {
    if (typeof node.addEventListener == 'function') {
      node.addEventListener(event, fn, opt_useCapture || false);
    }
    else if (typeof node.attachEvent == 'function') {
      node.attachEvent('on' + event, fn);
    }
  }


  /**
   * Removes a previously added event handler from a DOM node.
   * @param {Node} node The DOM node to remove the event handler from.
   * @param {string} event The event name.
   * @param {Function} fn The event handler to remove.
   * @param {boolean} opt_useCapture If the event handler was added with this
   *     flag set to true, it should be set to true here in order to remove it.
   */
  function removeEvent(node, event, fn, opt_useCapture) {
    if (typeof node.removeEventListener == 'function') {
      node.removeEventListener(event, fn, opt_useCapture || false);
    }
    else if (typeof node.detatchEvent == 'function') {
      node.detatchEvent('on' + event, fn);
    }
  }


  /**
   * Returns the intersection between two rect objects.
   * @param {Object} rect1 The first rect.
   * @param {Object} rect2 The second rect.
   * @return {?Object} The intersection rect or undefined if no intersection
   *     is found.
   */
  function computeRectIntersection(rect1, rect2) {
    var top = Math.max(rect1.top, rect2.top);
    var bottom = Math.min(rect1.bottom, rect2.bottom);
    var left = Math.max(rect1.left, rect2.left);
    var right = Math.min(rect1.right, rect2.right);
    var width = right - left;
    var height = bottom - top;

    return (width >= 0 && height >= 0) && {
      top: top,
      bottom: bottom,
      left: left,
      right: right,
      width: width,
      height: height
    };
  }


  /**
   * Shims the native getBoundingClientRect for compatibility with older IE.
   * @param {Element} el The element whose bounding rect to get.
   * @return {Object} The (possibly shimmed) rect of the element.
   */
  function getBoundingClientRect(el) {
    var rect;

    try {
      rect = el.getBoundingClientRect();
    } catch (err) {
      // Ignore Windows 7 IE11 "Unspecified error"
      // https://github.com/w3c/IntersectionObserver/pull/205
    }

    if (!rect) return getEmptyRect();

    // Older IE
    if (!(rect.width && rect.height)) {
      rect = {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top
      };
    }
    return rect;
  }


  /**
   * Returns an empty rect object. An empty rect is returned when an element
   * is not in the DOM.
   * @return {Object} The empty rect.
   */
  function getEmptyRect() {
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0
    };
  }

  /**
   * Checks to see if a parent element contains a child elemnt (including inside
   * shadow DOM).
   * @param {Node} parent The parent element.
   * @param {Node} child The child element.
   * @return {boolean} True if the parent node contains the child node.
   */
  function containsDeep(parent, child) {
    var node = child;
    while (node) {
      if (node == parent) return true;

      node = getParentNode(node);
    }
    return false;
  }


  /**
   * Gets the parent node of an element or its host element if the parent node
   * is a shadow root.
   * @param {Node} node The node whose parent to get.
   * @return {Node|null} The parent node or null if no parent exists.
   */
  function getParentNode(node) {
    var parent = node.parentNode;

    if (parent && parent.nodeType == 11 && parent.host) {
      // If the parent is a shadow root, return the host element.
      return parent.host;
    }
    return parent;
  }


// Exposes the constructors globally.
  window.IntersectionObserver = IntersectionObserver;
  window.IntersectionObserverEntry = IntersectionObserverEntry;

}(window, document));

(function($) {
  // Selector for off-site links
  // Usage: $("#content a:external")...
  $.expr.pseudos.externalLink = function(obj) {
    return (obj.href !== "" && obj.hostname != location.hostname) && (obj.protocol == 'http:' || obj.protocol == 'https:');
  };

  // Selector for on-site links
  // Usage: $("#content a:internal")...
  $.expr.pseudos.internalLink = function(obj) {
    return obj.hostname == location.hostname && (obj.protocol == 'http:' || obj.protocol == 'https:');
  };

  // Selector for email addresses
  // Usage: $("#content a:email")...
  $.expr.pseudos.emailLink = function(obj) {
    return obj.protocol === "mailto:";
  };

  // Selector for email addresses
  // Usage: $("#content a:telephone")...
  $.expr.pseudos.telephoneLink = function(obj) {
    return obj.protocol === "tel:";
  };

  // Selector for off-site links
  // Usage: $("#content a:external")...
  $.expr.pseudos.imageLink = function(obj) {
    return $(this).attr('href').match(/\.(jpg|jpeg|png|svg|gif|webp|tif{1,2}|ai|)/i);
  };
}( jQuery ));
window.libutils = {};

// utility fucntion to create function with timeout, used in ga events
libutils.actWithTimeOut = function(callback, opt_timeout) {
  let called = false;
  function fn() {
    if (!called) {
      called = true;
      callback();
    }
  }
  setTimeout(fn, opt_timeout || 1000);
  return fn;
};


// for ga events where we want to go directly to a typaheads url element
libutils.goToUrl = function(datum) {
  window.location.href = datum.url;
};

// for ga events where we want to message a url by concatenating a string and ID.
libutils.goToSubjectUrl = function(datum, path) {
  window.location.href = path + datum.id;
};

// convenience storage for reusable calls to sprinshare API urls.
libutils.sprinshareUrls = {
  "subject_experts": "https://lgapi-us.libapps.com/1.1/accounts/?site_id=702&key=9a0320695e007513e3f56d6f5f9e2159&expand=subjects",
  "databases": "https://lgapi-us.libapps.com/1.1/assets?site_id=702&key=9a0320695e007513e3f56d6f5f9e2159&asset_types=10&expand=az_props,subjects",
  "guides_expand_owner_subject": "https://lgapi-us.libapps.com/1.1/guides/?site_id=702&key=9a0320695e007513e3f56d6f5f9e2159&status[]=1&sort_by=name&expand=owner,subjects",
  "subjects_list": "https://lgapi-us.libapps.com/1.1/subjects?site_id=702&key=9a0320695e007513e3f56d6f5f9e2159",
  "answer_faqs": "https://api2.libanswers.com/1.0/search/%QUERY?iid=1758&callback=faqs"
};

// set the correct absolute path during development
if (location.hostname === "localhost" || location.hostname === "127.0.0.1"){
  libutils.siteDomain = "";
} else {
  libutils.siteDomain = "https://library.unt.edu";
}

$(document).ready(function(){

  // Enable tooltips
  $("[data-toggle=\"tooltip\"]").tooltip({
    container: "body"
  });
  // enable popovers
  $("[data-toggle=\"popover\"]").popover({
    container: "body"
  });


  // set a number of reusable DOM variables
  let $body = $("body"),
    $head = $("#head"),
    $scrolledHead = $("#scrolled-header"),
    $toTop = $("#to-top"),
    $bannerImg = $("#unt-banner-img"),
    $bannerLetterMark = $("#unt-banner-lettermark");

  // Set scrolling header ui by observing main nav relative to viewport
  let scrolledNav = document.querySelector("#primary-navigation"),
    scrolledNavObserver = new IntersectionObserver(function (entries, observer) {
      if (entries[0].isIntersecting) {
        $head.removeClass("scrolled");
        $bannerImg.removeClass("d-none");
        $bannerLetterMark.addClass("d-none");
        $toTop.fadeOut();
      } else {
        $head.addClass("scrolled");
        $bannerImg.addClass("d-none");
        $bannerLetterMark.removeClass("d-none");
        $toTop.fadeIn();
      }
    }, {
      threshold: [0, 1]
    });
  // do the observing
  scrolledNavObserver.observe( scrolledNav );

  // only relevant to homepage
  if ( $("body.home").length ) {
    // prep search tabs on homepage
    let $pillTabs = $("#v-pills-tab"),
      $pins = $pillTabs.find("span.badge"),
      $tabAlert = $("#tab-cookie-nofitication");

    // prevent hashes in url bar. show/hide pins for cookie state saving
    $pillTabs.find("a").on("click", function(e){
      e.preventDefault();
      let $this = $(this);
      $this.tab("show");
      $pins.hide();
      $this.find("span.badge").show();
    });

    // do tooltips for pins
    $pins.tooltip({
      container: "body",
      placement: "top",
      title: "Make this your default search"
    });

    // on pin click set cookie and show notification
    $pins.on("click", function(){
      let $this = $(this),
        which = $(this).data("value");

      $tabAlert.show();
      $pins.removeClass("text-white");
      $(this).addClass("text-white");

      localStorage.setItem("untlibrarysearchtab", which);

      window.setTimeout(function() {
        $tabAlert.fadeTo(500, 0).slideUp(500, function(){
          $(this).css( "opacity", 1 );
        });
      }, 5000);
    });

    // test localstorage for pinned tab, if not, activate 1st one.
    if ( localStorage.getItem("untlibrarysearchtab") ) {
      let savedTab = localStorage.getItem("untlibrarysearchtab");

      $pillTabs.find("[data-value=" + savedTab + "]")
        .closest("a")
        .tab("show");
    } else {
      $pillTabs.find("a").first().tab("show");
    }

    // user clicked a homepage tab, focus on the main search box.
    $("#v-pills-tab a").on("shown.bs.tab", function (e) {
      $("#v-pills-tabContent .active").find("input[type=\"text\"]:first").focus();
    });


    let savedDiscipline,
      savedSearchType,
      savedSearchScope,
      $summonDisciplineSelect =  $("#summon-discipline"),
      $summonParentForm = $("#search-articles-form"),
      $searchtypeSelect = $("#passThisSearchtype"),
      $searchScopeSelect = $("#searchscope"),
      $catalogTypeSelectParentForm = $("#search-catalog-form"),
      $invertAuthorBtn = $("#invert-author"),
      $searcharg = $("#searcharg");


    // get and set summon discipline if set in localStorage
    if ( localStorage.getItem("summondiscipline") ){
      savedDiscipline = localStorage.getItem("summondiscipline");
      $summonDisciplineSelect.val(savedDiscipline);
      $summonParentForm.data("ga-label", savedDiscipline);
    }

    // Remember changes to summon discipline dropdown.
    $summonDisciplineSelect.on("change", function(){
      let $this = $(this),
        val = $this.val() || "Any Discipline";
      $summonParentForm.data("ga-label", val);
      localStorage.setItem("summondiscipline", val);
    });

    // don't pass field names of elements with no value
    $summonParentForm.submit(function (e) {
      let $summonDiscipline = $("#summon-discipline"),
        disciplineVal = $summonDiscipline.val();
      if (disciplineVal === undefined || disciplineVal === "" || disciplineVal === "Any Discipline") {
        $summonDiscipline.attr("name", "");
      }
    });


    // get and set catalog search type if set in localStorage
    if ( localStorage.getItem("catalogsearchtype") ) {
      savedSearchType = localStorage.getItem("catalogsearchtype");
      $searchtypeSelect.val(savedSearchType);
      let scopeValue = $searchScopeSelect.val();

      $catalogTypeSelectParentForm.data("ga-label", savedSearchType + scopeValue);
      if (savedSearchType === "a") {
        $invertAuthorBtn.show();
      } else {
        $invertAuthorBtn.hide();
      }
    }

    // get and set catalog search scope if set in localStorage
    if ( localStorage.getItem("catalogsearchscope") ) {
      savedSearchScope = localStorage.getItem("catalogsearchscope");
      $searchScopeSelect.val(savedSearchScope);
      let typeValue = $searchtypeSelect.val();
      $catalogTypeSelectParentForm.data("ga-label", typeValue + savedSearchScope);
    }

    // Remember changes to catalog search type dropdown (keywords/titles, etc.).
    $searchtypeSelect.on("change", function(){
      let $this = $(this),
        val = $this.val();
      $catalogTypeSelectParentForm.data("ga-label", val + $searchScopeSelect.val());
      localStorage.setItem("catalogsearchtype", val);
      if (val === "a") {
        $invertAuthorBtn.show();
      } else {
        $invertAuthorBtn.hide();
      }
    });

    // Remember changes to catalog search type dropdown (keywords/titles, etc.).
    $searchScopeSelect.on("change", function(){
      let $this = $(this),
        val = $this.val();
      $catalogTypeSelectParentForm.data("ga-label", $searchtypeSelect.val() + val);
      localStorage.setItem("catalogsearchscope", val);
    });

    $invertAuthorBtn.on("click", function(){
      let queryToArray = $searcharg.val().trim().split(" "),
        lastName = queryToArray.pop(),
        theRest = queryToArray.join(" ");
      $searcharg.val(lastName + ", " + theRest );
    });

  }

  // When user clicks on the search icon in site header, auto-focus the bento box input after drawer has opened.
  $("#search-drawer").on("shown.bs.modal", function () {
    $("#drawer-q").focus();
  });

  // pretty scroll to top of the screen on button push,
  $("#to-top").on("click", function(e){
    e.preventDefault();
    $("body,html").animate({
      scrollTop: 0
    }, 800);
    // remove hashes in the URL.
    history.pushState("", document.title, window.location.pathname + window.location.search);
  });


  // homepage feature carousel
  $("#feature-wrapper").on("slide.bs.carousel", function () {
    $(this).find(".active a").first().focus();
  });


  // Add Table of contents links to the dropdown below the breadcrumbs.
  // Reuse previously rendered from anchor.js
  if (window.anchors && anchors.elements.length) {
    let $toc = $("#page-toc"),
      items = "",
      el, title, link, anc;

    $(anchors.elements).each(function() {
      let el = $(this),
        anc = el.find(".anchorjs-link")
      title = el.text(),
        link = "#" + el.attr("id"),
        tocLink = window.location.pathname + link,
        $inserted = `<li class="toc-entry toc-h2"><a data-ga-category="link - TOC" data-ga-action="page" data-ga-label="${tocLink}" href="${link}">${title}</a></li>`;

      items += $inserted;
      anc.attr("aria-label", "Anchor: " + title);
    });
    $($toc).append(items);
  } else{
    $("#page-toc").hide();
  }

  // old school jump menus cause sometimes they are the tool to use.
  $("form.jump").on("submit", function(e){
    e.preventDefault();
    let $jumpMenu = $(this).find("select"),
      selectedValue = $jumpMenu.find("option:selected").val();
    window.location.replace( selectedValue );
  });



  if ( $(".btn.clipboard-trigger").length ) {
    new ClipboardJS(".btn.clipboard-trigger");
  }

  // DOI search utility.  If DOI detected, offer popup with links directly to object and well formed summon search.
  $("input.doi-target").on("input", function(e){
    if (e.originalEvent.inputType == 'insertFromPaste') {
      let $this = $(this),
        $icon = $this.siblings(".input-group-append").find(".doi-icon"),
        $doimodal = $("#doi-modal"),
        $doiModalInput = $("#doi-text"),
        doiRe = /10.\d{4,9}\/[-._;()\/:A-Z0-9]+/ig,
        doiPaste = $this.val(),
        doi = doiPaste.match(doiRe);
      if (doi) {

        $doiModalInput.val(doi).trigger("change");

        $icon.removeClass("d-none").tooltip({
          placement: 'top',
          trigger: 'manual'
        }).tooltip("show");

        setTimeout(function(){
          $icon.focus();
        },100);

        $icon.on('blur', function(){
          $icon.tooltip('hide');
        });


      } else {
        $icon.addClass("d-none").tooltip("hide");
        $doiModalInput.val("").trigger("change");
      }
    }
  });

  $("#doi-text").on("change", function(){
    let doiVal = $(this).val();
    $("#doi-doiorg").attr("href", `https://libproxy.library.unt.edu/login?url=https://doi.org/${doiVal}`);
    $("#doi-oadoiorg").attr("href", `https://oadoi.org/${doiVal}`);
    $("#doi-summon").attr("href", `https://untexas.summon.serialssolutions.com/search#!/search?ho=f&l=en&q=(DOI:(${doiVal}))`);
  });
});
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyc2VjdGlvbi1vYnNlcnZlci5qcyIsImxpbmtzLmpzIiwibWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcHRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoidW50LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNiBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBXM0MgU09GVFdBUkUgQU5EIERPQ1VNRU5UIE5PVElDRSBBTkQgTElDRU5TRS5cbiAqXG4gKiAgaHR0cHM6Ly93d3cudzMub3JnL0NvbnNvcnRpdW0vTGVnYWwvMjAxNS9jb3B5cmlnaHQtc29mdHdhcmUtYW5kLWRvY3VtZW50XG4gKlxuICovXG5cbihmdW5jdGlvbih3aW5kb3csIGRvY3VtZW50KSB7XG4ndXNlIHN0cmljdCc7XG5cblxuLy8gRXhpdHMgZWFybHkgaWYgYWxsIEludGVyc2VjdGlvbk9ic2VydmVyIGFuZCBJbnRlcnNlY3Rpb25PYnNlcnZlckVudHJ5XG4vLyBmZWF0dXJlcyBhcmUgbmF0aXZlbHkgc3VwcG9ydGVkLlxuaWYgKCdJbnRlcnNlY3Rpb25PYnNlcnZlcicgaW4gd2luZG93ICYmXG4gICAgJ0ludGVyc2VjdGlvbk9ic2VydmVyRW50cnknIGluIHdpbmRvdyAmJlxuICAgICdpbnRlcnNlY3Rpb25SYXRpbycgaW4gd2luZG93LkludGVyc2VjdGlvbk9ic2VydmVyRW50cnkucHJvdG90eXBlKSB7XG5cbiAgLy8gTWluaW1hbCBwb2x5ZmlsbCBmb3IgRWRnZSAxNSdzIGxhY2sgb2YgYGlzSW50ZXJzZWN0aW5nYFxuICAvLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS93M2MvSW50ZXJzZWN0aW9uT2JzZXJ2ZXIvaXNzdWVzLzIxMVxuICBpZiAoISgnaXNJbnRlcnNlY3RpbmcnIGluIHdpbmRvdy5JbnRlcnNlY3Rpb25PYnNlcnZlckVudHJ5LnByb3RvdHlwZSkpIHtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkod2luZG93LkludGVyc2VjdGlvbk9ic2VydmVyRW50cnkucHJvdG90eXBlLFxuICAgICAgJ2lzSW50ZXJzZWN0aW5nJywge1xuICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmludGVyc2VjdGlvblJhdGlvID4gMDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm47XG59XG5cblxuLyoqXG4gKiBBbiBJbnRlcnNlY3Rpb25PYnNlcnZlciByZWdpc3RyeS4gVGhpcyByZWdpc3RyeSBleGlzdHMgdG8gaG9sZCBhIHN0cm9uZ1xuICogcmVmZXJlbmNlIHRvIEludGVyc2VjdGlvbk9ic2VydmVyIGluc3RhbmNlcyBjdXJyZW50bHkgb2JzZXJ2ZXJpbmcgYSB0YXJnZXRcbiAqIGVsZW1lbnQuIFdpdGhvdXQgdGhpcyByZWdpc3RyeSwgaW5zdGFuY2VzIHdpdGhvdXQgYW5vdGhlciByZWZlcmVuY2UgbWF5IGJlXG4gKiBnYXJiYWdlIGNvbGxlY3RlZC5cbiAqL1xudmFyIHJlZ2lzdHJ5ID0gW107XG5cblxuLyoqXG4gKiBDcmVhdGVzIHRoZSBnbG9iYWwgSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeSBjb25zdHJ1Y3Rvci5cbiAqIGh0dHBzOi8vdzNjLmdpdGh1Yi5pby9JbnRlcnNlY3Rpb25PYnNlcnZlci8jaW50ZXJzZWN0aW9uLW9ic2VydmVyLWVudHJ5XG4gKiBAcGFyYW0ge09iamVjdH0gZW50cnkgQSBkaWN0aW9uYXJ5IG9mIGluc3RhbmNlIHByb3BlcnRpZXMuXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeShlbnRyeSkge1xuICB0aGlzLnRpbWUgPSBlbnRyeS50aW1lO1xuICB0aGlzLnRhcmdldCA9IGVudHJ5LnRhcmdldDtcbiAgdGhpcy5yb290Qm91bmRzID0gZW50cnkucm9vdEJvdW5kcztcbiAgdGhpcy5ib3VuZGluZ0NsaWVudFJlY3QgPSBlbnRyeS5ib3VuZGluZ0NsaWVudFJlY3Q7XG4gIHRoaXMuaW50ZXJzZWN0aW9uUmVjdCA9IGVudHJ5LmludGVyc2VjdGlvblJlY3QgfHwgZ2V0RW1wdHlSZWN0KCk7XG4gIHRoaXMuaXNJbnRlcnNlY3RpbmcgPSAhIWVudHJ5LmludGVyc2VjdGlvblJlY3Q7XG5cbiAgLy8gQ2FsY3VsYXRlcyB0aGUgaW50ZXJzZWN0aW9uIHJhdGlvLlxuICB2YXIgdGFyZ2V0UmVjdCA9IHRoaXMuYm91bmRpbmdDbGllbnRSZWN0O1xuICB2YXIgdGFyZ2V0QXJlYSA9IHRhcmdldFJlY3Qud2lkdGggKiB0YXJnZXRSZWN0LmhlaWdodDtcbiAgdmFyIGludGVyc2VjdGlvblJlY3QgPSB0aGlzLmludGVyc2VjdGlvblJlY3Q7XG4gIHZhciBpbnRlcnNlY3Rpb25BcmVhID0gaW50ZXJzZWN0aW9uUmVjdC53aWR0aCAqIGludGVyc2VjdGlvblJlY3QuaGVpZ2h0O1xuXG4gIC8vIFNldHMgaW50ZXJzZWN0aW9uIHJhdGlvLlxuICBpZiAodGFyZ2V0QXJlYSkge1xuICAgIHRoaXMuaW50ZXJzZWN0aW9uUmF0aW8gPSBpbnRlcnNlY3Rpb25BcmVhIC8gdGFyZ2V0QXJlYTtcbiAgfSBlbHNlIHtcbiAgICAvLyBJZiBhcmVhIGlzIHplcm8gYW5kIGlzIGludGVyc2VjdGluZywgc2V0cyB0byAxLCBvdGhlcndpc2UgdG8gMFxuICAgIHRoaXMuaW50ZXJzZWN0aW9uUmF0aW8gPSB0aGlzLmlzSW50ZXJzZWN0aW5nID8gMSA6IDA7XG4gIH1cbn1cblxuXG4vKipcbiAqIENyZWF0ZXMgdGhlIGdsb2JhbCBJbnRlcnNlY3Rpb25PYnNlcnZlciBjb25zdHJ1Y3Rvci5cbiAqIGh0dHBzOi8vdzNjLmdpdGh1Yi5pby9JbnRlcnNlY3Rpb25PYnNlcnZlci8jaW50ZXJzZWN0aW9uLW9ic2VydmVyLWludGVyZmFjZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRvIGJlIGludm9rZWQgYWZ0ZXIgaW50ZXJzZWN0aW9uXG4gKiAgICAgY2hhbmdlcyBoYXZlIHF1ZXVlZC4gVGhlIGZ1bmN0aW9uIGlzIG5vdCBpbnZva2VkIGlmIHRoZSBxdWV1ZSBoYXNcbiAqICAgICBiZWVuIGVtcHRpZWQgYnkgY2FsbGluZyB0aGUgYHRha2VSZWNvcmRzYCBtZXRob2QuXG4gKiBAcGFyYW0ge09iamVjdD19IG9wdF9vcHRpb25zIE9wdGlvbmFsIGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBJbnRlcnNlY3Rpb25PYnNlcnZlcihjYWxsYmFjaywgb3B0X29wdGlvbnMpIHtcblxuICB2YXIgb3B0aW9ucyA9IG9wdF9vcHRpb25zIHx8IHt9O1xuXG4gIGlmICh0eXBlb2YgY2FsbGJhY2sgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gIH1cblxuICBpZiAob3B0aW9ucy5yb290ICYmIG9wdGlvbnMucm9vdC5ub2RlVHlwZSAhPSAxKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdyb290IG11c3QgYmUgYW4gRWxlbWVudCcpO1xuICB9XG5cbiAgLy8gQmluZHMgYW5kIHRocm90dGxlcyBgdGhpcy5fY2hlY2tGb3JJbnRlcnNlY3Rpb25zYC5cbiAgdGhpcy5fY2hlY2tGb3JJbnRlcnNlY3Rpb25zID0gdGhyb3R0bGUoXG4gICAgICB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMuYmluZCh0aGlzKSwgdGhpcy5USFJPVFRMRV9USU1FT1VUKTtcblxuICAvLyBQcml2YXRlIHByb3BlcnRpZXMuXG4gIHRoaXMuX2NhbGxiYWNrID0gY2FsbGJhY2s7XG4gIHRoaXMuX29ic2VydmF0aW9uVGFyZ2V0cyA9IFtdO1xuICB0aGlzLl9xdWV1ZWRFbnRyaWVzID0gW107XG4gIHRoaXMuX3Jvb3RNYXJnaW5WYWx1ZXMgPSB0aGlzLl9wYXJzZVJvb3RNYXJnaW4ob3B0aW9ucy5yb290TWFyZ2luKTtcblxuICAvLyBQdWJsaWMgcHJvcGVydGllcy5cbiAgdGhpcy50aHJlc2hvbGRzID0gdGhpcy5faW5pdFRocmVzaG9sZHMob3B0aW9ucy50aHJlc2hvbGQpO1xuICB0aGlzLnJvb3QgPSBvcHRpb25zLnJvb3QgfHwgbnVsbDtcbiAgdGhpcy5yb290TWFyZ2luID0gdGhpcy5fcm9vdE1hcmdpblZhbHVlcy5tYXAoZnVuY3Rpb24obWFyZ2luKSB7XG4gICAgcmV0dXJuIG1hcmdpbi52YWx1ZSArIG1hcmdpbi51bml0O1xuICB9KS5qb2luKCcgJyk7XG59XG5cblxuLyoqXG4gKiBUaGUgbWluaW11bSBpbnRlcnZhbCB3aXRoaW4gd2hpY2ggdGhlIGRvY3VtZW50IHdpbGwgYmUgY2hlY2tlZCBmb3JcbiAqIGludGVyc2VjdGlvbiBjaGFuZ2VzLlxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuVEhST1RUTEVfVElNRU9VVCA9IDEwMDtcblxuXG4vKipcbiAqIFRoZSBmcmVxdWVuY3kgaW4gd2hpY2ggdGhlIHBvbHlmaWxsIHBvbGxzIGZvciBpbnRlcnNlY3Rpb24gY2hhbmdlcy5cbiAqIHRoaXMgY2FuIGJlIHVwZGF0ZWQgb24gYSBwZXIgaW5zdGFuY2UgYmFzaXMgYW5kIG11c3QgYmUgc2V0IHByaW9yIHRvXG4gKiBjYWxsaW5nIGBvYnNlcnZlYCBvbiB0aGUgZmlyc3QgdGFyZ2V0LlxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuUE9MTF9JTlRFUlZBTCA9IG51bGw7XG5cbi8qKlxuICogVXNlIGEgbXV0YXRpb24gb2JzZXJ2ZXIgb24gdGhlIHJvb3QgZWxlbWVudFxuICogdG8gZGV0ZWN0IGludGVyc2VjdGlvbiBjaGFuZ2VzLlxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuVVNFX01VVEFUSU9OX09CU0VSVkVSID0gdHJ1ZTtcblxuXG4vKipcbiAqIFN0YXJ0cyBvYnNlcnZpbmcgYSB0YXJnZXQgZWxlbWVudCBmb3IgaW50ZXJzZWN0aW9uIGNoYW5nZXMgYmFzZWQgb25cbiAqIHRoZSB0aHJlc2hvbGRzIHZhbHVlcy5cbiAqIEBwYXJhbSB7RWxlbWVudH0gdGFyZ2V0IFRoZSBET00gZWxlbWVudCB0byBvYnNlcnZlLlxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUub2JzZXJ2ZSA9IGZ1bmN0aW9uKHRhcmdldCkge1xuICB2YXIgaXNUYXJnZXRBbHJlYWR5T2JzZXJ2ZWQgPSB0aGlzLl9vYnNlcnZhdGlvblRhcmdldHMuc29tZShmdW5jdGlvbihpdGVtKSB7XG4gICAgcmV0dXJuIGl0ZW0uZWxlbWVudCA9PSB0YXJnZXQ7XG4gIH0pO1xuXG4gIGlmIChpc1RhcmdldEFscmVhZHlPYnNlcnZlZCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghKHRhcmdldCAmJiB0YXJnZXQubm9kZVR5cGUgPT0gMSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3RhcmdldCBtdXN0IGJlIGFuIEVsZW1lbnQnKTtcbiAgfVxuXG4gIHRoaXMuX3JlZ2lzdGVySW5zdGFuY2UoKTtcbiAgdGhpcy5fb2JzZXJ2YXRpb25UYXJnZXRzLnB1c2goe2VsZW1lbnQ6IHRhcmdldCwgZW50cnk6IG51bGx9KTtcbiAgdGhpcy5fbW9uaXRvckludGVyc2VjdGlvbnMoKTtcbiAgdGhpcy5fY2hlY2tGb3JJbnRlcnNlY3Rpb25zKCk7XG59O1xuXG5cbi8qKlxuICogU3RvcHMgb2JzZXJ2aW5nIGEgdGFyZ2V0IGVsZW1lbnQgZm9yIGludGVyc2VjdGlvbiBjaGFuZ2VzLlxuICogQHBhcmFtIHtFbGVtZW50fSB0YXJnZXQgVGhlIERPTSBlbGVtZW50IHRvIG9ic2VydmUuXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS51bm9ic2VydmUgPSBmdW5jdGlvbih0YXJnZXQpIHtcbiAgdGhpcy5fb2JzZXJ2YXRpb25UYXJnZXRzID1cbiAgICAgIHRoaXMuX29ic2VydmF0aW9uVGFyZ2V0cy5maWx0ZXIoZnVuY3Rpb24oaXRlbSkge1xuXG4gICAgcmV0dXJuIGl0ZW0uZWxlbWVudCAhPSB0YXJnZXQ7XG4gIH0pO1xuICBpZiAoIXRoaXMuX29ic2VydmF0aW9uVGFyZ2V0cy5sZW5ndGgpIHtcbiAgICB0aGlzLl91bm1vbml0b3JJbnRlcnNlY3Rpb25zKCk7XG4gICAgdGhpcy5fdW5yZWdpc3Rlckluc3RhbmNlKCk7XG4gIH1cbn07XG5cblxuLyoqXG4gKiBTdG9wcyBvYnNlcnZpbmcgYWxsIHRhcmdldCBlbGVtZW50cyBmb3IgaW50ZXJzZWN0aW9uIGNoYW5nZXMuXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5kaXNjb25uZWN0ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuX29ic2VydmF0aW9uVGFyZ2V0cyA9IFtdO1xuICB0aGlzLl91bm1vbml0b3JJbnRlcnNlY3Rpb25zKCk7XG4gIHRoaXMuX3VucmVnaXN0ZXJJbnN0YW5jZSgpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgYW55IHF1ZXVlIGVudHJpZXMgdGhhdCBoYXZlIG5vdCB5ZXQgYmVlbiByZXBvcnRlZCB0byB0aGVcbiAqIGNhbGxiYWNrIGFuZCBjbGVhcnMgdGhlIHF1ZXVlLiBUaGlzIGNhbiBiZSB1c2VkIGluIGNvbmp1bmN0aW9uIHdpdGggdGhlXG4gKiBjYWxsYmFjayB0byBvYnRhaW4gdGhlIGFic29sdXRlIG1vc3QgdXAtdG8tZGF0ZSBpbnRlcnNlY3Rpb24gaW5mb3JtYXRpb24uXG4gKiBAcmV0dXJuIHtBcnJheX0gVGhlIGN1cnJlbnRseSBxdWV1ZWQgZW50cmllcy5cbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLnRha2VSZWNvcmRzID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZWNvcmRzID0gdGhpcy5fcXVldWVkRW50cmllcy5zbGljZSgpO1xuICB0aGlzLl9xdWV1ZWRFbnRyaWVzID0gW107XG4gIHJldHVybiByZWNvcmRzO1xufTtcblxuXG4vKipcbiAqIEFjY2VwdHMgdGhlIHRocmVzaG9sZCB2YWx1ZSBmcm9tIHRoZSB1c2VyIGNvbmZpZ3VyYXRpb24gb2JqZWN0IGFuZFxuICogcmV0dXJucyBhIHNvcnRlZCBhcnJheSBvZiB1bmlxdWUgdGhyZXNob2xkIHZhbHVlcy4gSWYgYSB2YWx1ZSBpcyBub3RcbiAqIGJldHdlZW4gMCBhbmQgMSBhbmQgZXJyb3IgaXMgdGhyb3duLlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7QXJyYXl8bnVtYmVyPX0gb3B0X3RocmVzaG9sZCBBbiBvcHRpb25hbCB0aHJlc2hvbGQgdmFsdWUgb3JcbiAqICAgICBhIGxpc3Qgb2YgdGhyZXNob2xkIHZhbHVlcywgZGVmYXVsdGluZyB0byBbMF0uXG4gKiBAcmV0dXJuIHtBcnJheX0gQSBzb3J0ZWQgbGlzdCBvZiB1bmlxdWUgYW5kIHZhbGlkIHRocmVzaG9sZCB2YWx1ZXMuXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5faW5pdFRocmVzaG9sZHMgPSBmdW5jdGlvbihvcHRfdGhyZXNob2xkKSB7XG4gIHZhciB0aHJlc2hvbGQgPSBvcHRfdGhyZXNob2xkIHx8IFswXTtcbiAgaWYgKCFBcnJheS5pc0FycmF5KHRocmVzaG9sZCkpIHRocmVzaG9sZCA9IFt0aHJlc2hvbGRdO1xuXG4gIHJldHVybiB0aHJlc2hvbGQuc29ydCgpLmZpbHRlcihmdW5jdGlvbih0LCBpLCBhKSB7XG4gICAgaWYgKHR5cGVvZiB0ICE9ICdudW1iZXInIHx8IGlzTmFOKHQpIHx8IHQgPCAwIHx8IHQgPiAxKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RocmVzaG9sZCBtdXN0IGJlIGEgbnVtYmVyIGJldHdlZW4gMCBhbmQgMSBpbmNsdXNpdmVseScpO1xuICAgIH1cbiAgICByZXR1cm4gdCAhPT0gYVtpIC0gMV07XG4gIH0pO1xufTtcblxuXG4vKipcbiAqIEFjY2VwdHMgdGhlIHJvb3RNYXJnaW4gdmFsdWUgZnJvbSB0aGUgdXNlciBjb25maWd1cmF0aW9uIG9iamVjdFxuICogYW5kIHJldHVybnMgYW4gYXJyYXkgb2YgdGhlIGZvdXIgbWFyZ2luIHZhbHVlcyBhcyBhbiBvYmplY3QgY29udGFpbmluZ1xuICogdGhlIHZhbHVlIGFuZCB1bml0IHByb3BlcnRpZXMuIElmIGFueSBvZiB0aGUgdmFsdWVzIGFyZSBub3QgcHJvcGVybHlcbiAqIGZvcm1hdHRlZCBvciB1c2UgYSB1bml0IG90aGVyIHRoYW4gcHggb3IgJSwgYW5kIGVycm9yIGlzIHRocm93bi5cbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge3N0cmluZz19IG9wdF9yb290TWFyZ2luIEFuIG9wdGlvbmFsIHJvb3RNYXJnaW4gdmFsdWUsXG4gKiAgICAgZGVmYXVsdGluZyB0byAnMHB4Jy5cbiAqIEByZXR1cm4ge0FycmF5PE9iamVjdD59IEFuIGFycmF5IG9mIG1hcmdpbiBvYmplY3RzIHdpdGggdGhlIGtleXNcbiAqICAgICB2YWx1ZSBhbmQgdW5pdC5cbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLl9wYXJzZVJvb3RNYXJnaW4gPSBmdW5jdGlvbihvcHRfcm9vdE1hcmdpbikge1xuICB2YXIgbWFyZ2luU3RyaW5nID0gb3B0X3Jvb3RNYXJnaW4gfHwgJzBweCc7XG4gIHZhciBtYXJnaW5zID0gbWFyZ2luU3RyaW5nLnNwbGl0KC9cXHMrLykubWFwKGZ1bmN0aW9uKG1hcmdpbikge1xuICAgIHZhciBwYXJ0cyA9IC9eKC0/XFxkKlxcLj9cXGQrKShweHwlKSQvLmV4ZWMobWFyZ2luKTtcbiAgICBpZiAoIXBhcnRzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jvb3RNYXJnaW4gbXVzdCBiZSBzcGVjaWZpZWQgaW4gcGl4ZWxzIG9yIHBlcmNlbnQnKTtcbiAgICB9XG4gICAgcmV0dXJuIHt2YWx1ZTogcGFyc2VGbG9hdChwYXJ0c1sxXSksIHVuaXQ6IHBhcnRzWzJdfTtcbiAgfSk7XG5cbiAgLy8gSGFuZGxlcyBzaG9ydGhhbmQuXG4gIG1hcmdpbnNbMV0gPSBtYXJnaW5zWzFdIHx8IG1hcmdpbnNbMF07XG4gIG1hcmdpbnNbMl0gPSBtYXJnaW5zWzJdIHx8IG1hcmdpbnNbMF07XG4gIG1hcmdpbnNbM10gPSBtYXJnaW5zWzNdIHx8IG1hcmdpbnNbMV07XG5cbiAgcmV0dXJuIG1hcmdpbnM7XG59O1xuXG5cbi8qKlxuICogU3RhcnRzIHBvbGxpbmcgZm9yIGludGVyc2VjdGlvbiBjaGFuZ2VzIGlmIHRoZSBwb2xsaW5nIGlzIG5vdCBhbHJlYWR5XG4gKiBoYXBwZW5pbmcsIGFuZCBpZiB0aGUgcGFnZSdzIHZpc2liaWx0eSBzdGF0ZSBpcyB2aXNpYmxlLlxuICogQHByaXZhdGVcbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLl9tb25pdG9ySW50ZXJzZWN0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMuX21vbml0b3JpbmdJbnRlcnNlY3Rpb25zKSB7XG4gICAgdGhpcy5fbW9uaXRvcmluZ0ludGVyc2VjdGlvbnMgPSB0cnVlO1xuXG4gICAgLy8gSWYgYSBwb2xsIGludGVydmFsIGlzIHNldCwgdXNlIHBvbGxpbmcgaW5zdGVhZCBvZiBsaXN0ZW5pbmcgdG9cbiAgICAvLyByZXNpemUgYW5kIHNjcm9sbCBldmVudHMgb3IgRE9NIG11dGF0aW9ucy5cbiAgICBpZiAodGhpcy5QT0xMX0lOVEVSVkFMKSB7XG4gICAgICB0aGlzLl9tb25pdG9yaW5nSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbChcbiAgICAgICAgICB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMsIHRoaXMuUE9MTF9JTlRFUlZBTCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgYWRkRXZlbnQod2luZG93LCAncmVzaXplJywgdGhpcy5fY2hlY2tGb3JJbnRlcnNlY3Rpb25zLCB0cnVlKTtcbiAgICAgIGFkZEV2ZW50KGRvY3VtZW50LCAnc2Nyb2xsJywgdGhpcy5fY2hlY2tGb3JJbnRlcnNlY3Rpb25zLCB0cnVlKTtcblxuICAgICAgaWYgKHRoaXMuVVNFX01VVEFUSU9OX09CU0VSVkVSICYmICdNdXRhdGlvbk9ic2VydmVyJyBpbiB3aW5kb3cpIHtcbiAgICAgICAgdGhpcy5fZG9tT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcih0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMpO1xuICAgICAgICB0aGlzLl9kb21PYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LCB7XG4gICAgICAgICAgYXR0cmlidXRlczogdHJ1ZSxcbiAgICAgICAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgICAgICAgY2hhcmFjdGVyRGF0YTogdHJ1ZSxcbiAgICAgICAgICBzdWJ0cmVlOiB0cnVlXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuXG4vKipcbiAqIFN0b3BzIHBvbGxpbmcgZm9yIGludGVyc2VjdGlvbiBjaGFuZ2VzLlxuICogQHByaXZhdGVcbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLl91bm1vbml0b3JJbnRlcnNlY3Rpb25zID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLl9tb25pdG9yaW5nSW50ZXJzZWN0aW9ucykge1xuICAgIHRoaXMuX21vbml0b3JpbmdJbnRlcnNlY3Rpb25zID0gZmFsc2U7XG5cbiAgICBjbGVhckludGVydmFsKHRoaXMuX21vbml0b3JpbmdJbnRlcnZhbCk7XG4gICAgdGhpcy5fbW9uaXRvcmluZ0ludGVydmFsID0gbnVsbDtcblxuICAgIHJlbW92ZUV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScsIHRoaXMuX2NoZWNrRm9ySW50ZXJzZWN0aW9ucywgdHJ1ZSk7XG4gICAgcmVtb3ZlRXZlbnQoZG9jdW1lbnQsICdzY3JvbGwnLCB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMsIHRydWUpO1xuXG4gICAgaWYgKHRoaXMuX2RvbU9ic2VydmVyKSB7XG4gICAgICB0aGlzLl9kb21PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgICB0aGlzLl9kb21PYnNlcnZlciA9IG51bGw7XG4gICAgfVxuICB9XG59O1xuXG5cbi8qKlxuICogU2NhbnMgZWFjaCBvYnNlcnZhdGlvbiB0YXJnZXQgZm9yIGludGVyc2VjdGlvbiBjaGFuZ2VzIGFuZCBhZGRzIHRoZW1cbiAqIHRvIHRoZSBpbnRlcm5hbCBlbnRyaWVzIHF1ZXVlLiBJZiBuZXcgZW50cmllcyBhcmUgZm91bmQsIGl0XG4gKiBzY2hlZHVsZXMgdGhlIGNhbGxiYWNrIHRvIGJlIGludm9rZWQuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX2NoZWNrRm9ySW50ZXJzZWN0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcm9vdElzSW5Eb20gPSB0aGlzLl9yb290SXNJbkRvbSgpO1xuICB2YXIgcm9vdFJlY3QgPSByb290SXNJbkRvbSA/IHRoaXMuX2dldFJvb3RSZWN0KCkgOiBnZXRFbXB0eVJlY3QoKTtcblxuICB0aGlzLl9vYnNlcnZhdGlvblRhcmdldHMuZm9yRWFjaChmdW5jdGlvbihpdGVtKSB7XG4gICAgdmFyIHRhcmdldCA9IGl0ZW0uZWxlbWVudDtcbiAgICB2YXIgdGFyZ2V0UmVjdCA9IGdldEJvdW5kaW5nQ2xpZW50UmVjdCh0YXJnZXQpO1xuICAgIHZhciByb290Q29udGFpbnNUYXJnZXQgPSB0aGlzLl9yb290Q29udGFpbnNUYXJnZXQodGFyZ2V0KTtcbiAgICB2YXIgb2xkRW50cnkgPSBpdGVtLmVudHJ5O1xuICAgIHZhciBpbnRlcnNlY3Rpb25SZWN0ID0gcm9vdElzSW5Eb20gJiYgcm9vdENvbnRhaW5zVGFyZ2V0ICYmXG4gICAgICAgIHRoaXMuX2NvbXB1dGVUYXJnZXRBbmRSb290SW50ZXJzZWN0aW9uKHRhcmdldCwgcm9vdFJlY3QpO1xuXG4gICAgdmFyIG5ld0VudHJ5ID0gaXRlbS5lbnRyeSA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlckVudHJ5KHtcbiAgICAgIHRpbWU6IG5vdygpLFxuICAgICAgdGFyZ2V0OiB0YXJnZXQsXG4gICAgICBib3VuZGluZ0NsaWVudFJlY3Q6IHRhcmdldFJlY3QsXG4gICAgICByb290Qm91bmRzOiByb290UmVjdCxcbiAgICAgIGludGVyc2VjdGlvblJlY3Q6IGludGVyc2VjdGlvblJlY3RcbiAgICB9KTtcblxuICAgIGlmICghb2xkRW50cnkpIHtcbiAgICAgIHRoaXMuX3F1ZXVlZEVudHJpZXMucHVzaChuZXdFbnRyeSk7XG4gICAgfSBlbHNlIGlmIChyb290SXNJbkRvbSAmJiByb290Q29udGFpbnNUYXJnZXQpIHtcbiAgICAgIC8vIElmIHRoZSBuZXcgZW50cnkgaW50ZXJzZWN0aW9uIHJhdGlvIGhhcyBjcm9zc2VkIGFueSBvZiB0aGVcbiAgICAgIC8vIHRocmVzaG9sZHMsIGFkZCBhIG5ldyBlbnRyeS5cbiAgICAgIGlmICh0aGlzLl9oYXNDcm9zc2VkVGhyZXNob2xkKG9sZEVudHJ5LCBuZXdFbnRyeSkpIHtcbiAgICAgICAgdGhpcy5fcXVldWVkRW50cmllcy5wdXNoKG5ld0VudHJ5KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSWYgdGhlIHJvb3QgaXMgbm90IGluIHRoZSBET00gb3IgdGFyZ2V0IGlzIG5vdCBjb250YWluZWQgd2l0aGluXG4gICAgICAvLyByb290IGJ1dCB0aGUgcHJldmlvdXMgZW50cnkgZm9yIHRoaXMgdGFyZ2V0IGhhZCBhbiBpbnRlcnNlY3Rpb24sXG4gICAgICAvLyBhZGQgYSBuZXcgcmVjb3JkIGluZGljYXRpbmcgcmVtb3ZhbC5cbiAgICAgIGlmIChvbGRFbnRyeSAmJiBvbGRFbnRyeS5pc0ludGVyc2VjdGluZykge1xuICAgICAgICB0aGlzLl9xdWV1ZWRFbnRyaWVzLnB1c2gobmV3RW50cnkpO1xuICAgICAgfVxuICAgIH1cbiAgfSwgdGhpcyk7XG5cbiAgaWYgKHRoaXMuX3F1ZXVlZEVudHJpZXMubGVuZ3RoKSB7XG4gICAgdGhpcy5fY2FsbGJhY2sodGhpcy50YWtlUmVjb3JkcygpLCB0aGlzKTtcbiAgfVxufTtcblxuXG4vKipcbiAqIEFjY2VwdHMgYSB0YXJnZXQgYW5kIHJvb3QgcmVjdCBjb21wdXRlcyB0aGUgaW50ZXJzZWN0aW9uIGJldHdlZW4gdGhlblxuICogZm9sbG93aW5nIHRoZSBhbGdvcml0aG0gaW4gdGhlIHNwZWMuXG4gKiBUT0RPKHBoaWxpcHdhbHRvbik6IGF0IHRoaXMgdGltZSBjbGlwLXBhdGggaXMgbm90IGNvbnNpZGVyZWQuXG4gKiBodHRwczovL3czYy5naXRodWIuaW8vSW50ZXJzZWN0aW9uT2JzZXJ2ZXIvI2NhbGN1bGF0ZS1pbnRlcnNlY3Rpb24tcmVjdC1hbGdvXG4gKiBAcGFyYW0ge0VsZW1lbnR9IHRhcmdldCBUaGUgdGFyZ2V0IERPTSBlbGVtZW50XG4gKiBAcGFyYW0ge09iamVjdH0gcm9vdFJlY3QgVGhlIGJvdW5kaW5nIHJlY3Qgb2YgdGhlIHJvb3QgYWZ0ZXIgYmVpbmdcbiAqICAgICBleHBhbmRlZCBieSB0aGUgcm9vdE1hcmdpbiB2YWx1ZS5cbiAqIEByZXR1cm4gez9PYmplY3R9IFRoZSBmaW5hbCBpbnRlcnNlY3Rpb24gcmVjdCBvYmplY3Qgb3IgdW5kZWZpbmVkIGlmIG5vXG4gKiAgICAgaW50ZXJzZWN0aW9uIGlzIGZvdW5kLlxuICogQHByaXZhdGVcbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLl9jb21wdXRlVGFyZ2V0QW5kUm9vdEludGVyc2VjdGlvbiA9XG4gICAgZnVuY3Rpb24odGFyZ2V0LCByb290UmVjdCkge1xuXG4gIC8vIElmIHRoZSBlbGVtZW50IGlzbid0IGRpc3BsYXllZCwgYW4gaW50ZXJzZWN0aW9uIGNhbid0IGhhcHBlbi5cbiAgaWYgKHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHRhcmdldCkuZGlzcGxheSA9PSAnbm9uZScpIHJldHVybjtcblxuICB2YXIgdGFyZ2V0UmVjdCA9IGdldEJvdW5kaW5nQ2xpZW50UmVjdCh0YXJnZXQpO1xuICB2YXIgaW50ZXJzZWN0aW9uUmVjdCA9IHRhcmdldFJlY3Q7XG4gIHZhciBwYXJlbnQgPSBnZXRQYXJlbnROb2RlKHRhcmdldCk7XG4gIHZhciBhdFJvb3QgPSBmYWxzZTtcblxuICB3aGlsZSAoIWF0Um9vdCkge1xuICAgIHZhciBwYXJlbnRSZWN0ID0gbnVsbDtcbiAgICB2YXIgcGFyZW50Q29tcHV0ZWRTdHlsZSA9IHBhcmVudC5ub2RlVHlwZSA9PSAxID9cbiAgICAgICAgd2luZG93LmdldENvbXB1dGVkU3R5bGUocGFyZW50KSA6IHt9O1xuXG4gICAgLy8gSWYgdGhlIHBhcmVudCBpc24ndCBkaXNwbGF5ZWQsIGFuIGludGVyc2VjdGlvbiBjYW4ndCBoYXBwZW4uXG4gICAgaWYgKHBhcmVudENvbXB1dGVkU3R5bGUuZGlzcGxheSA9PSAnbm9uZScpIHJldHVybjtcblxuICAgIGlmIChwYXJlbnQgPT0gdGhpcy5yb290IHx8IHBhcmVudCA9PSBkb2N1bWVudCkge1xuICAgICAgYXRSb290ID0gdHJ1ZTtcbiAgICAgIHBhcmVudFJlY3QgPSByb290UmVjdDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gSWYgdGhlIGVsZW1lbnQgaGFzIGEgbm9uLXZpc2libGUgb3ZlcmZsb3csIGFuZCBpdCdzIG5vdCB0aGUgPGJvZHk+XG4gICAgICAvLyBvciA8aHRtbD4gZWxlbWVudCwgdXBkYXRlIHRoZSBpbnRlcnNlY3Rpb24gcmVjdC5cbiAgICAgIC8vIE5vdGU6IDxib2R5PiBhbmQgPGh0bWw+IGNhbm5vdCBiZSBjbGlwcGVkIHRvIGEgcmVjdCB0aGF0J3Mgbm90IGFsc29cbiAgICAgIC8vIHRoZSBkb2N1bWVudCByZWN0LCBzbyBubyBuZWVkIHRvIGNvbXB1dGUgYSBuZXcgaW50ZXJzZWN0aW9uLlxuICAgICAgaWYgKHBhcmVudCAhPSBkb2N1bWVudC5ib2R5ICYmXG4gICAgICAgICAgcGFyZW50ICE9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCAmJlxuICAgICAgICAgIHBhcmVudENvbXB1dGVkU3R5bGUub3ZlcmZsb3cgIT0gJ3Zpc2libGUnKSB7XG4gICAgICAgIHBhcmVudFJlY3QgPSBnZXRCb3VuZGluZ0NsaWVudFJlY3QocGFyZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJZiBlaXRoZXIgb2YgdGhlIGFib3ZlIGNvbmRpdGlvbmFscyBzZXQgYSBuZXcgcGFyZW50UmVjdCxcbiAgICAvLyBjYWxjdWxhdGUgbmV3IGludGVyc2VjdGlvbiBkYXRhLlxuICAgIGlmIChwYXJlbnRSZWN0KSB7XG4gICAgICBpbnRlcnNlY3Rpb25SZWN0ID0gY29tcHV0ZVJlY3RJbnRlcnNlY3Rpb24ocGFyZW50UmVjdCwgaW50ZXJzZWN0aW9uUmVjdCk7XG5cbiAgICAgIGlmICghaW50ZXJzZWN0aW9uUmVjdCkgYnJlYWs7XG4gICAgfVxuICAgIHBhcmVudCA9IGdldFBhcmVudE5vZGUocGFyZW50KTtcbiAgfVxuICByZXR1cm4gaW50ZXJzZWN0aW9uUmVjdDtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByb290IHJlY3QgYWZ0ZXIgYmVpbmcgZXhwYW5kZWQgYnkgdGhlIHJvb3RNYXJnaW4gdmFsdWUuXG4gKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBleHBhbmRlZCByb290IHJlY3QuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX2dldFJvb3RSZWN0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciByb290UmVjdDtcbiAgaWYgKHRoaXMucm9vdCkge1xuICAgIHJvb3RSZWN0ID0gZ2V0Qm91bmRpbmdDbGllbnRSZWN0KHRoaXMucm9vdCk7XG4gIH0gZWxzZSB7XG4gICAgLy8gVXNlIDxodG1sPi88Ym9keT4gaW5zdGVhZCBvZiB3aW5kb3cgc2luY2Ugc2Nyb2xsIGJhcnMgYWZmZWN0IHNpemUuXG4gICAgdmFyIGh0bWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gICAgdmFyIGJvZHkgPSBkb2N1bWVudC5ib2R5O1xuICAgIHJvb3RSZWN0ID0ge1xuICAgICAgdG9wOiAwLFxuICAgICAgbGVmdDogMCxcbiAgICAgIHJpZ2h0OiBodG1sLmNsaWVudFdpZHRoIHx8IGJvZHkuY2xpZW50V2lkdGgsXG4gICAgICB3aWR0aDogaHRtbC5jbGllbnRXaWR0aCB8fCBib2R5LmNsaWVudFdpZHRoLFxuICAgICAgYm90dG9tOiBodG1sLmNsaWVudEhlaWdodCB8fCBib2R5LmNsaWVudEhlaWdodCxcbiAgICAgIGhlaWdodDogaHRtbC5jbGllbnRIZWlnaHQgfHwgYm9keS5jbGllbnRIZWlnaHRcbiAgICB9O1xuICB9XG4gIHJldHVybiB0aGlzLl9leHBhbmRSZWN0QnlSb290TWFyZ2luKHJvb3RSZWN0KTtcbn07XG5cblxuLyoqXG4gKiBBY2NlcHRzIGEgcmVjdCBhbmQgZXhwYW5kcyBpdCBieSB0aGUgcm9vdE1hcmdpbiB2YWx1ZS5cbiAqIEBwYXJhbSB7T2JqZWN0fSByZWN0IFRoZSByZWN0IG9iamVjdCB0byBleHBhbmQuXG4gKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBleHBhbmRlZCByZWN0LlxuICogQHByaXZhdGVcbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLl9leHBhbmRSZWN0QnlSb290TWFyZ2luID0gZnVuY3Rpb24ocmVjdCkge1xuICB2YXIgbWFyZ2lucyA9IHRoaXMuX3Jvb3RNYXJnaW5WYWx1ZXMubWFwKGZ1bmN0aW9uKG1hcmdpbiwgaSkge1xuICAgIHJldHVybiBtYXJnaW4udW5pdCA9PSAncHgnID8gbWFyZ2luLnZhbHVlIDpcbiAgICAgICAgbWFyZ2luLnZhbHVlICogKGkgJSAyID8gcmVjdC53aWR0aCA6IHJlY3QuaGVpZ2h0KSAvIDEwMDtcbiAgfSk7XG4gIHZhciBuZXdSZWN0ID0ge1xuICAgIHRvcDogcmVjdC50b3AgLSBtYXJnaW5zWzBdLFxuICAgIHJpZ2h0OiByZWN0LnJpZ2h0ICsgbWFyZ2luc1sxXSxcbiAgICBib3R0b206IHJlY3QuYm90dG9tICsgbWFyZ2luc1syXSxcbiAgICBsZWZ0OiByZWN0LmxlZnQgLSBtYXJnaW5zWzNdXG4gIH07XG4gIG5ld1JlY3Qud2lkdGggPSBuZXdSZWN0LnJpZ2h0IC0gbmV3UmVjdC5sZWZ0O1xuICBuZXdSZWN0LmhlaWdodCA9IG5ld1JlY3QuYm90dG9tIC0gbmV3UmVjdC50b3A7XG5cbiAgcmV0dXJuIG5ld1JlY3Q7XG59O1xuXG5cbi8qKlxuICogQWNjZXB0cyBhbiBvbGQgYW5kIG5ldyBlbnRyeSBhbmQgcmV0dXJucyB0cnVlIGlmIGF0IGxlYXN0IG9uZSBvZiB0aGVcbiAqIHRocmVzaG9sZCB2YWx1ZXMgaGFzIGJlZW4gY3Jvc3NlZC5cbiAqIEBwYXJhbSB7P0ludGVyc2VjdGlvbk9ic2VydmVyRW50cnl9IG9sZEVudHJ5IFRoZSBwcmV2aW91cyBlbnRyeSBmb3IgYVxuICogICAgcGFydGljdWxhciB0YXJnZXQgZWxlbWVudCBvciBudWxsIGlmIG5vIHByZXZpb3VzIGVudHJ5IGV4aXN0cy5cbiAqIEBwYXJhbSB7SW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeX0gbmV3RW50cnkgVGhlIGN1cnJlbnQgZW50cnkgZm9yIGFcbiAqICAgIHBhcnRpY3VsYXIgdGFyZ2V0IGVsZW1lbnQuXG4gKiBAcmV0dXJuIHtib29sZWFufSBSZXR1cm5zIHRydWUgaWYgYSBhbnkgdGhyZXNob2xkIGhhcyBiZWVuIGNyb3NzZWQuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX2hhc0Nyb3NzZWRUaHJlc2hvbGQgPVxuICAgIGZ1bmN0aW9uKG9sZEVudHJ5LCBuZXdFbnRyeSkge1xuXG4gIC8vIFRvIG1ha2UgY29tcGFyaW5nIGVhc2llciwgYW4gZW50cnkgdGhhdCBoYXMgYSByYXRpbyBvZiAwXG4gIC8vIGJ1dCBkb2VzIG5vdCBhY3R1YWxseSBpbnRlcnNlY3QgaXMgZ2l2ZW4gYSB2YWx1ZSBvZiAtMVxuICB2YXIgb2xkUmF0aW8gPSBvbGRFbnRyeSAmJiBvbGRFbnRyeS5pc0ludGVyc2VjdGluZyA/XG4gICAgICBvbGRFbnRyeS5pbnRlcnNlY3Rpb25SYXRpbyB8fCAwIDogLTE7XG4gIHZhciBuZXdSYXRpbyA9IG5ld0VudHJ5LmlzSW50ZXJzZWN0aW5nID9cbiAgICAgIG5ld0VudHJ5LmludGVyc2VjdGlvblJhdGlvIHx8IDAgOiAtMTtcblxuICAvLyBJZ25vcmUgdW5jaGFuZ2VkIHJhdGlvc1xuICBpZiAob2xkUmF0aW8gPT09IG5ld1JhdGlvKSByZXR1cm47XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnRocmVzaG9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgdGhyZXNob2xkID0gdGhpcy50aHJlc2hvbGRzW2ldO1xuXG4gICAgLy8gUmV0dXJuIHRydWUgaWYgYW4gZW50cnkgbWF0Y2hlcyBhIHRocmVzaG9sZCBvciBpZiB0aGUgbmV3IHJhdGlvXG4gICAgLy8gYW5kIHRoZSBvbGQgcmF0aW8gYXJlIG9uIHRoZSBvcHBvc2l0ZSBzaWRlcyBvZiBhIHRocmVzaG9sZC5cbiAgICBpZiAodGhyZXNob2xkID09IG9sZFJhdGlvIHx8IHRocmVzaG9sZCA9PSBuZXdSYXRpbyB8fFxuICAgICAgICB0aHJlc2hvbGQgPCBvbGRSYXRpbyAhPT0gdGhyZXNob2xkIDwgbmV3UmF0aW8pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxufTtcblxuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciBvciBub3QgdGhlIHJvb3QgZWxlbWVudCBpcyBhbiBlbGVtZW50IGFuZCBpcyBpbiB0aGUgRE9NLlxuICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgcm9vdCBlbGVtZW50IGlzIGFuIGVsZW1lbnQgYW5kIGlzIGluIHRoZSBET00uXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX3Jvb3RJc0luRG9tID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAhdGhpcy5yb290IHx8IGNvbnRhaW5zRGVlcChkb2N1bWVudCwgdGhpcy5yb290KTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHdoZXRoZXIgb3Igbm90IHRoZSB0YXJnZXQgZWxlbWVudCBpcyBhIGNoaWxkIG9mIHJvb3QuXG4gKiBAcGFyYW0ge0VsZW1lbnR9IHRhcmdldCBUaGUgdGFyZ2V0IGVsZW1lbnQgdG8gY2hlY2suXG4gKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSB0YXJnZXQgZWxlbWVudCBpcyBhIGNoaWxkIG9mIHJvb3QuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX3Jvb3RDb250YWluc1RhcmdldCA9IGZ1bmN0aW9uKHRhcmdldCkge1xuICByZXR1cm4gY29udGFpbnNEZWVwKHRoaXMucm9vdCB8fCBkb2N1bWVudCwgdGFyZ2V0KTtcbn07XG5cblxuLyoqXG4gKiBBZGRzIHRoZSBpbnN0YW5jZSB0byB0aGUgZ2xvYmFsIEludGVyc2VjdGlvbk9ic2VydmVyIHJlZ2lzdHJ5IGlmIGl0IGlzbid0XG4gKiBhbHJlYWR5IHByZXNlbnQuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX3JlZ2lzdGVySW5zdGFuY2UgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHJlZ2lzdHJ5LmluZGV4T2YodGhpcykgPCAwKSB7XG4gICAgcmVnaXN0cnkucHVzaCh0aGlzKTtcbiAgfVxufTtcblxuXG4vKipcbiAqIFJlbW92ZXMgdGhlIGluc3RhbmNlIGZyb20gdGhlIGdsb2JhbCBJbnRlcnNlY3Rpb25PYnNlcnZlciByZWdpc3RyeS5cbiAqIEBwcml2YXRlXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5fdW5yZWdpc3Rlckluc3RhbmNlID0gZnVuY3Rpb24oKSB7XG4gIHZhciBpbmRleCA9IHJlZ2lzdHJ5LmluZGV4T2YodGhpcyk7XG4gIGlmIChpbmRleCAhPSAtMSkgcmVnaXN0cnkuc3BsaWNlKGluZGV4LCAxKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByZXN1bHQgb2YgdGhlIHBlcmZvcm1hbmNlLm5vdygpIG1ldGhvZCBvciBudWxsIGluIGJyb3dzZXJzXG4gKiB0aGF0IGRvbid0IHN1cHBvcnQgdGhlIEFQSS5cbiAqIEByZXR1cm4ge251bWJlcn0gVGhlIGVsYXBzZWQgdGltZSBzaW5jZSB0aGUgcGFnZSB3YXMgcmVxdWVzdGVkLlxuICovXG5mdW5jdGlvbiBub3coKSB7XG4gIHJldHVybiB3aW5kb3cucGVyZm9ybWFuY2UgJiYgcGVyZm9ybWFuY2Uubm93ICYmIHBlcmZvcm1hbmNlLm5vdygpO1xufVxuXG5cbi8qKlxuICogVGhyb3R0bGVzIGEgZnVuY3Rpb24gYW5kIGRlbGF5cyBpdHMgZXhlY3V0aW9uZywgc28gaXQncyBvbmx5IGNhbGxlZCBhdCBtb3N0XG4gKiBvbmNlIHdpdGhpbiBhIGdpdmVuIHRpbWUgcGVyaW9kLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gVGhlIGZ1bmN0aW9uIHRvIHRocm90dGxlLlxuICogQHBhcmFtIHtudW1iZXJ9IHRpbWVvdXQgVGhlIGFtb3VudCBvZiB0aW1lIHRoYXQgbXVzdCBwYXNzIGJlZm9yZSB0aGVcbiAqICAgICBmdW5jdGlvbiBjYW4gYmUgY2FsbGVkIGFnYWluLlxuICogQHJldHVybiB7RnVuY3Rpb259IFRoZSB0aHJvdHRsZWQgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIHRocm90dGxlKGZuLCB0aW1lb3V0KSB7XG4gIHZhciB0aW1lciA9IG51bGw7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKCF0aW1lcikge1xuICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICBmbigpO1xuICAgICAgICB0aW1lciA9IG51bGw7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9XG4gIH07XG59XG5cblxuLyoqXG4gKiBBZGRzIGFuIGV2ZW50IGhhbmRsZXIgdG8gYSBET00gbm9kZSBlbnN1cmluZyBjcm9zcy1icm93c2VyIGNvbXBhdGliaWxpdHkuXG4gKiBAcGFyYW0ge05vZGV9IG5vZGUgVGhlIERPTSBub2RlIHRvIGFkZCB0aGUgZXZlbnQgaGFuZGxlciB0by5cbiAqIEBwYXJhbSB7c3RyaW5nfSBldmVudCBUaGUgZXZlbnQgbmFtZS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuIFRoZSBldmVudCBoYW5kbGVyIHRvIGFkZC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gb3B0X3VzZUNhcHR1cmUgT3B0aW9uYWxseSBhZGRzIHRoZSBldmVuIHRvIHRoZSBjYXB0dXJlXG4gKiAgICAgcGhhc2UuIE5vdGU6IHRoaXMgb25seSB3b3JrcyBpbiBtb2Rlcm4gYnJvd3NlcnMuXG4gKi9cbmZ1bmN0aW9uIGFkZEV2ZW50KG5vZGUsIGV2ZW50LCBmbiwgb3B0X3VzZUNhcHR1cmUpIHtcbiAgaWYgKHR5cGVvZiBub2RlLmFkZEV2ZW50TGlzdGVuZXIgPT0gJ2Z1bmN0aW9uJykge1xuICAgIG5vZGUuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgZm4sIG9wdF91c2VDYXB0dXJlIHx8IGZhbHNlKTtcbiAgfVxuICBlbHNlIGlmICh0eXBlb2Ygbm9kZS5hdHRhY2hFdmVudCA9PSAnZnVuY3Rpb24nKSB7XG4gICAgbm9kZS5hdHRhY2hFdmVudCgnb24nICsgZXZlbnQsIGZuKTtcbiAgfVxufVxuXG5cbi8qKlxuICogUmVtb3ZlcyBhIHByZXZpb3VzbHkgYWRkZWQgZXZlbnQgaGFuZGxlciBmcm9tIGEgRE9NIG5vZGUuXG4gKiBAcGFyYW0ge05vZGV9IG5vZGUgVGhlIERPTSBub2RlIHRvIHJlbW92ZSB0aGUgZXZlbnQgaGFuZGxlciBmcm9tLlxuICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50IFRoZSBldmVudCBuYW1lLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gVGhlIGV2ZW50IGhhbmRsZXIgdG8gcmVtb3ZlLlxuICogQHBhcmFtIHtib29sZWFufSBvcHRfdXNlQ2FwdHVyZSBJZiB0aGUgZXZlbnQgaGFuZGxlciB3YXMgYWRkZWQgd2l0aCB0aGlzXG4gKiAgICAgZmxhZyBzZXQgdG8gdHJ1ZSwgaXQgc2hvdWxkIGJlIHNldCB0byB0cnVlIGhlcmUgaW4gb3JkZXIgdG8gcmVtb3ZlIGl0LlxuICovXG5mdW5jdGlvbiByZW1vdmVFdmVudChub2RlLCBldmVudCwgZm4sIG9wdF91c2VDYXB0dXJlKSB7XG4gIGlmICh0eXBlb2Ygbm9kZS5yZW1vdmVFdmVudExpc3RlbmVyID09ICdmdW5jdGlvbicpIHtcbiAgICBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGZuLCBvcHRfdXNlQ2FwdHVyZSB8fCBmYWxzZSk7XG4gIH1cbiAgZWxzZSBpZiAodHlwZW9mIG5vZGUuZGV0YXRjaEV2ZW50ID09ICdmdW5jdGlvbicpIHtcbiAgICBub2RlLmRldGF0Y2hFdmVudCgnb24nICsgZXZlbnQsIGZuKTtcbiAgfVxufVxuXG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW50ZXJzZWN0aW9uIGJldHdlZW4gdHdvIHJlY3Qgb2JqZWN0cy5cbiAqIEBwYXJhbSB7T2JqZWN0fSByZWN0MSBUaGUgZmlyc3QgcmVjdC5cbiAqIEBwYXJhbSB7T2JqZWN0fSByZWN0MiBUaGUgc2Vjb25kIHJlY3QuXG4gKiBAcmV0dXJuIHs/T2JqZWN0fSBUaGUgaW50ZXJzZWN0aW9uIHJlY3Qgb3IgdW5kZWZpbmVkIGlmIG5vIGludGVyc2VjdGlvblxuICogICAgIGlzIGZvdW5kLlxuICovXG5mdW5jdGlvbiBjb21wdXRlUmVjdEludGVyc2VjdGlvbihyZWN0MSwgcmVjdDIpIHtcbiAgdmFyIHRvcCA9IE1hdGgubWF4KHJlY3QxLnRvcCwgcmVjdDIudG9wKTtcbiAgdmFyIGJvdHRvbSA9IE1hdGgubWluKHJlY3QxLmJvdHRvbSwgcmVjdDIuYm90dG9tKTtcbiAgdmFyIGxlZnQgPSBNYXRoLm1heChyZWN0MS5sZWZ0LCByZWN0Mi5sZWZ0KTtcbiAgdmFyIHJpZ2h0ID0gTWF0aC5taW4ocmVjdDEucmlnaHQsIHJlY3QyLnJpZ2h0KTtcbiAgdmFyIHdpZHRoID0gcmlnaHQgLSBsZWZ0O1xuICB2YXIgaGVpZ2h0ID0gYm90dG9tIC0gdG9wO1xuXG4gIHJldHVybiAod2lkdGggPj0gMCAmJiBoZWlnaHQgPj0gMCkgJiYge1xuICAgIHRvcDogdG9wLFxuICAgIGJvdHRvbTogYm90dG9tLFxuICAgIGxlZnQ6IGxlZnQsXG4gICAgcmlnaHQ6IHJpZ2h0LFxuICAgIHdpZHRoOiB3aWR0aCxcbiAgICBoZWlnaHQ6IGhlaWdodFxuICB9O1xufVxuXG5cbi8qKlxuICogU2hpbXMgdGhlIG5hdGl2ZSBnZXRCb3VuZGluZ0NsaWVudFJlY3QgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBvbGRlciBJRS5cbiAqIEBwYXJhbSB7RWxlbWVudH0gZWwgVGhlIGVsZW1lbnQgd2hvc2UgYm91bmRpbmcgcmVjdCB0byBnZXQuXG4gKiBAcmV0dXJuIHtPYmplY3R9IFRoZSAocG9zc2libHkgc2hpbW1lZCkgcmVjdCBvZiB0aGUgZWxlbWVudC5cbiAqL1xuZnVuY3Rpb24gZ2V0Qm91bmRpbmdDbGllbnRSZWN0KGVsKSB7XG4gIHZhciByZWN0O1xuXG4gIHRyeSB7XG4gICAgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICAvLyBJZ25vcmUgV2luZG93cyA3IElFMTEgXCJVbnNwZWNpZmllZCBlcnJvclwiXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3czYy9JbnRlcnNlY3Rpb25PYnNlcnZlci9wdWxsLzIwNVxuICB9XG5cbiAgaWYgKCFyZWN0KSByZXR1cm4gZ2V0RW1wdHlSZWN0KCk7XG5cbiAgLy8gT2xkZXIgSUVcbiAgaWYgKCEocmVjdC53aWR0aCAmJiByZWN0LmhlaWdodCkpIHtcbiAgICByZWN0ID0ge1xuICAgICAgdG9wOiByZWN0LnRvcCxcbiAgICAgIHJpZ2h0OiByZWN0LnJpZ2h0LFxuICAgICAgYm90dG9tOiByZWN0LmJvdHRvbSxcbiAgICAgIGxlZnQ6IHJlY3QubGVmdCxcbiAgICAgIHdpZHRoOiByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0LFxuICAgICAgaGVpZ2h0OiByZWN0LmJvdHRvbSAtIHJlY3QudG9wXG4gICAgfTtcbiAgfVxuICByZXR1cm4gcmVjdDtcbn1cblxuXG4vKipcbiAqIFJldHVybnMgYW4gZW1wdHkgcmVjdCBvYmplY3QuIEFuIGVtcHR5IHJlY3QgaXMgcmV0dXJuZWQgd2hlbiBhbiBlbGVtZW50XG4gKiBpcyBub3QgaW4gdGhlIERPTS5cbiAqIEByZXR1cm4ge09iamVjdH0gVGhlIGVtcHR5IHJlY3QuXG4gKi9cbmZ1bmN0aW9uIGdldEVtcHR5UmVjdCgpIHtcbiAgcmV0dXJuIHtcbiAgICB0b3A6IDAsXG4gICAgYm90dG9tOiAwLFxuICAgIGxlZnQ6IDAsXG4gICAgcmlnaHQ6IDAsXG4gICAgd2lkdGg6IDAsXG4gICAgaGVpZ2h0OiAwXG4gIH07XG59XG5cbi8qKlxuICogQ2hlY2tzIHRvIHNlZSBpZiBhIHBhcmVudCBlbGVtZW50IGNvbnRhaW5zIGEgY2hpbGQgZWxlbW50IChpbmNsdWRpbmcgaW5zaWRlXG4gKiBzaGFkb3cgRE9NKS5cbiAqIEBwYXJhbSB7Tm9kZX0gcGFyZW50IFRoZSBwYXJlbnQgZWxlbWVudC5cbiAqIEBwYXJhbSB7Tm9kZX0gY2hpbGQgVGhlIGNoaWxkIGVsZW1lbnQuXG4gKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBwYXJlbnQgbm9kZSBjb250YWlucyB0aGUgY2hpbGQgbm9kZS5cbiAqL1xuZnVuY3Rpb24gY29udGFpbnNEZWVwKHBhcmVudCwgY2hpbGQpIHtcbiAgdmFyIG5vZGUgPSBjaGlsZDtcbiAgd2hpbGUgKG5vZGUpIHtcbiAgICBpZiAobm9kZSA9PSBwYXJlbnQpIHJldHVybiB0cnVlO1xuXG4gICAgbm9kZSA9IGdldFBhcmVudE5vZGUobm9kZSk7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5cbi8qKlxuICogR2V0cyB0aGUgcGFyZW50IG5vZGUgb2YgYW4gZWxlbWVudCBvciBpdHMgaG9zdCBlbGVtZW50IGlmIHRoZSBwYXJlbnQgbm9kZVxuICogaXMgYSBzaGFkb3cgcm9vdC5cbiAqIEBwYXJhbSB7Tm9kZX0gbm9kZSBUaGUgbm9kZSB3aG9zZSBwYXJlbnQgdG8gZ2V0LlxuICogQHJldHVybiB7Tm9kZXxudWxsfSBUaGUgcGFyZW50IG5vZGUgb3IgbnVsbCBpZiBubyBwYXJlbnQgZXhpc3RzLlxuICovXG5mdW5jdGlvbiBnZXRQYXJlbnROb2RlKG5vZGUpIHtcbiAgdmFyIHBhcmVudCA9IG5vZGUucGFyZW50Tm9kZTtcblxuICBpZiAocGFyZW50ICYmIHBhcmVudC5ub2RlVHlwZSA9PSAxMSAmJiBwYXJlbnQuaG9zdCkge1xuICAgIC8vIElmIHRoZSBwYXJlbnQgaXMgYSBzaGFkb3cgcm9vdCwgcmV0dXJuIHRoZSBob3N0IGVsZW1lbnQuXG4gICAgcmV0dXJuIHBhcmVudC5ob3N0O1xuICB9XG4gIHJldHVybiBwYXJlbnQ7XG59XG5cblxuLy8gRXhwb3NlcyB0aGUgY29uc3RydWN0b3JzIGdsb2JhbGx5Llxud2luZG93LkludGVyc2VjdGlvbk9ic2VydmVyID0gSW50ZXJzZWN0aW9uT2JzZXJ2ZXI7XG53aW5kb3cuSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeSA9IEludGVyc2VjdGlvbk9ic2VydmVyRW50cnk7XG5cbn0od2luZG93LCBkb2N1bWVudCkpO1xuIiwiKGZ1bmN0aW9uKCQpIHtcbiAgICAvLyBTZWxlY3RvciBmb3Igb2ZmLXNpdGUgbGlua3NcbiAgICAvLyBVc2FnZTogJChcIiNjb250ZW50IGE6ZXh0ZXJuYWxcIikuLi5cbiAgICAkLmV4cHIucHNldWRvcy5leHRlcm5hbExpbmsgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgICAgcmV0dXJuIChvYmouaHJlZiAhPT0gXCJcIiAmJiBvYmouaG9zdG5hbWUgIT0gbG9jYXRpb24uaG9zdG5hbWUpICYmIChvYmoucHJvdG9jb2wgPT0gJ2h0dHA6JyB8fCBvYmoucHJvdG9jb2wgPT0gJ2h0dHBzOicpO1xuICAgIH07XG5cbiAgICAvLyBTZWxlY3RvciBmb3Igb24tc2l0ZSBsaW5rc1xuICAgIC8vIFVzYWdlOiAkKFwiI2NvbnRlbnQgYTppbnRlcm5hbFwiKS4uLlxuICAgICQuZXhwci5wc2V1ZG9zLmludGVybmFsTGluayA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgICByZXR1cm4gb2JqLmhvc3RuYW1lID09IGxvY2F0aW9uLmhvc3RuYW1lICYmIChvYmoucHJvdG9jb2wgPT0gJ2h0dHA6JyB8fCBvYmoucHJvdG9jb2wgPT0gJ2h0dHBzOicpO1xuICAgIH07XG5cbiAgICAvLyBTZWxlY3RvciBmb3IgZW1haWwgYWRkcmVzc2VzXG4gICAgLy8gVXNhZ2U6ICQoXCIjY29udGVudCBhOmVtYWlsXCIpLi4uXG4gICAgJC5leHByLnBzZXVkb3MuZW1haWxMaW5rID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHJldHVybiBvYmoucHJvdG9jb2wgPT09IFwibWFpbHRvOlwiO1xuICAgIH07XG5cbiAgICAvLyBTZWxlY3RvciBmb3IgZW1haWwgYWRkcmVzc2VzXG4gICAgLy8gVXNhZ2U6ICQoXCIjY29udGVudCBhOnRlbGVwaG9uZVwiKS4uLlxuICAgICQuZXhwci5wc2V1ZG9zLnRlbGVwaG9uZUxpbmsgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgICAgcmV0dXJuIG9iai5wcm90b2NvbCA9PT0gXCJ0ZWw6XCI7XG4gICAgfTtcblxuICAgIC8vIFNlbGVjdG9yIGZvciBvZmYtc2l0ZSBsaW5rc1xuICAgIC8vIFVzYWdlOiAkKFwiI2NvbnRlbnQgYTpleHRlcm5hbFwiKS4uLlxuICAgICQuZXhwci5wc2V1ZG9zLmltYWdlTGluayA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgICByZXR1cm4gJCh0aGlzKS5hdHRyKCdocmVmJykubWF0Y2goL1xcLihqcGd8anBlZ3xwbmd8c3ZnfGdpZnx3ZWJwfHRpZnsxLDJ9fGFpfCkvaSk7XG4gICAgfTtcbn0oIGpRdWVyeSApKTsiLCJ3aW5kb3cubGlidXRpbHMgPSB7fTtcblxuLy8gdXRpbGl0eSBmdWNudGlvbiB0byBjcmVhdGUgZnVuY3Rpb24gd2l0aCB0aW1lb3V0LCB1c2VkIGluIGdhIGV2ZW50c1xubGlidXRpbHMuYWN0V2l0aFRpbWVPdXQgPSBmdW5jdGlvbihjYWxsYmFjaywgb3B0X3RpbWVvdXQpIHtcbiAgbGV0IGNhbGxlZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBmbigpIHtcbiAgICBpZiAoIWNhbGxlZCkge1xuICAgICAgY2FsbGVkID0gdHJ1ZTtcbiAgICAgIGNhbGxiYWNrKCk7XG4gICAgfVxuICB9XG4gIHNldFRpbWVvdXQoZm4sIG9wdF90aW1lb3V0IHx8IDEwMDApO1xuICByZXR1cm4gZm47XG59O1xuXG5cbi8vIGZvciBnYSBldmVudHMgd2hlcmUgd2Ugd2FudCB0byBnbyBkaXJlY3RseSB0byBhIHR5cGFoZWFkcyB1cmwgZWxlbWVudFxubGlidXRpbHMuZ29Ub1VybCA9IGZ1bmN0aW9uKGRhdHVtKSB7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSBkYXR1bS51cmw7XG59O1xuXG4vLyBmb3IgZ2EgZXZlbnRzIHdoZXJlIHdlIHdhbnQgdG8gbWVzc2FnZSBhIHVybCBieSBjb25jYXRlbmF0aW5nIGEgc3RyaW5nIGFuZCBJRC5cbmxpYnV0aWxzLmdvVG9TdWJqZWN0VXJsID0gZnVuY3Rpb24oZGF0dW0sIHBhdGgpIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHBhdGggKyBkYXR1bS5pZDtcbn07XG5cbi8vIGNvbnZlbmllbmNlIHN0b3JhZ2UgZm9yIHJldXNhYmxlIGNhbGxzIHRvIHNwcmluc2hhcmUgQVBJIHVybHMuXG5saWJ1dGlscy5zcHJpbnNoYXJlVXJscyA9IHtcbiAgXCJzdWJqZWN0X2V4cGVydHNcIjogXCJodHRwczovL2xnYXBpLXVzLmxpYmFwcHMuY29tLzEuMS9hY2NvdW50cy8/c2l0ZV9pZD03MDIma2V5PTlhMDMyMDY5NWUwMDc1MTNlM2Y1NmQ2ZjVmOWUyMTU5JmV4cGFuZD1zdWJqZWN0c1wiLFxuICBcImRhdGFiYXNlc1wiOiBcImh0dHBzOi8vbGdhcGktdXMubGliYXBwcy5jb20vMS4xL2Fzc2V0cz9zaXRlX2lkPTcwMiZrZXk9OWEwMzIwNjk1ZTAwNzUxM2UzZjU2ZDZmNWY5ZTIxNTkmYXNzZXRfdHlwZXM9MTAmZXhwYW5kPWF6X3Byb3BzLHN1YmplY3RzXCIsXG4gIFwiZ3VpZGVzX2V4cGFuZF9vd25lcl9zdWJqZWN0XCI6IFwiaHR0cHM6Ly9sZ2FwaS11cy5saWJhcHBzLmNvbS8xLjEvZ3VpZGVzLz9zaXRlX2lkPTcwMiZrZXk9OWEwMzIwNjk1ZTAwNzUxM2UzZjU2ZDZmNWY5ZTIxNTkmc3RhdHVzW109MSZzb3J0X2J5PW5hbWUmZXhwYW5kPW93bmVyLHN1YmplY3RzXCIsXG4gIFwic3ViamVjdHNfbGlzdFwiOiBcImh0dHBzOi8vbGdhcGktdXMubGliYXBwcy5jb20vMS4xL3N1YmplY3RzP3NpdGVfaWQ9NzAyJmtleT05YTAzMjA2OTVlMDA3NTEzZTNmNTZkNmY1ZjllMjE1OVwiLFxuICBcImFuc3dlcl9mYXFzXCI6IFwiaHR0cHM6Ly9hcGkyLmxpYmFuc3dlcnMuY29tLzEuMC9zZWFyY2gvJVFVRVJZP2lpZD0xNzU4JmNhbGxiYWNrPWZhcXNcIlxufTtcblxuLy8gc2V0IHRoZSBjb3JyZWN0IGFic29sdXRlIHBhdGggZHVyaW5nIGRldmVsb3BtZW50XG5pZiAobG9jYXRpb24uaG9zdG5hbWUgPT09IFwibG9jYWxob3N0XCIgfHwgbG9jYXRpb24uaG9zdG5hbWUgPT09IFwiMTI3LjAuMC4xXCIpe1xuICAgIGxpYnV0aWxzLnNpdGVEb21haW4gPSBcIlwiO1xufSBlbHNlIHtcbiAgICBsaWJ1dGlscy5zaXRlRG9tYWluID0gXCJodHRwczovL2xpYnJhcnkudW50LmVkdVwiO1xufVxuXG4kKGRvY3VtZW50KS5yZWFkeShmdW5jdGlvbigpe1xuXG4gICAgLy8gRW5hYmxlIHRvb2x0aXBzXG4gICAgJChcIltkYXRhLXRvZ2dsZT1cXFwidG9vbHRpcFxcXCJdXCIpLnRvb2x0aXAoe1xuICAgICAgICBjb250YWluZXI6IFwiYm9keVwiXG4gICAgfSk7XG4gICAgLy8gZW5hYmxlIHBvcG92ZXJzXG4gICAgJChcIltkYXRhLXRvZ2dsZT1cXFwicG9wb3ZlclxcXCJdXCIpLnBvcG92ZXIoe1xuICAgICAgICBjb250YWluZXI6IFwiYm9keVwiXG4gICAgfSk7XG5cblxuICAgIC8vIHNldCBhIG51bWJlciBvZiByZXVzYWJsZSBET00gdmFyaWFibGVzXG4gICAgbGV0ICRib2R5ID0gJChcImJvZHlcIiksXG4gICAgICAgICRoZWFkID0gJChcIiNoZWFkXCIpLFxuICAgICAgICAkc2Nyb2xsZWRIZWFkID0gJChcIiNzY3JvbGxlZC1oZWFkZXJcIiksXG4gICAgICAgICR0b1RvcCA9ICQoXCIjdG8tdG9wXCIpLFxuICAgICAgICAkYmFubmVySW1nID0gJChcIiN1bnQtYmFubmVyLWltZ1wiKSxcbiAgICAgICAgJGJhbm5lckxldHRlck1hcmsgPSAkKFwiI3VudC1iYW5uZXItbGV0dGVybWFya1wiKTtcblxuICAgIC8vIFNldCBzY3JvbGxpbmcgaGVhZGVyIHVpIGJ5IG9ic2VydmluZyBtYWluIG5hdiByZWxhdGl2ZSB0byB2aWV3cG9ydFxuICAgIGxldCBzY3JvbGxlZE5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcHJpbWFyeS1uYXZpZ2F0aW9uXCIpLFxuICAgICAgICBzY3JvbGxlZE5hdk9ic2VydmVyID0gbmV3IEludGVyc2VjdGlvbk9ic2VydmVyKGZ1bmN0aW9uIChlbnRyaWVzLCBvYnNlcnZlcikge1xuICAgICAgICBpZiAoZW50cmllc1swXS5pc0ludGVyc2VjdGluZykge1xuICAgICAgICAgICAgJGhlYWQucmVtb3ZlQ2xhc3MoXCJzY3JvbGxlZFwiKTtcbiAgICAgICAgICAgICRiYW5uZXJJbWcucmVtb3ZlQ2xhc3MoXCJkLW5vbmVcIik7XG4gICAgICAgICAgICAkYmFubmVyTGV0dGVyTWFyay5hZGRDbGFzcyhcImQtbm9uZVwiKTtcbiAgICAgICAgICAgICR0b1RvcC5mYWRlT3V0KCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkaGVhZC5hZGRDbGFzcyhcInNjcm9sbGVkXCIpO1xuICAgICAgICAgICAgJGJhbm5lckltZy5hZGRDbGFzcyhcImQtbm9uZVwiKTtcbiAgICAgICAgICAgICRiYW5uZXJMZXR0ZXJNYXJrLnJlbW92ZUNsYXNzKFwiZC1ub25lXCIpO1xuICAgICAgICAgICAgJHRvVG9wLmZhZGVJbigpO1xuICAgICAgICB9XG4gICAgfSwge1xuICAgICAgICB0aHJlc2hvbGQ6IFswLCAxXVxuICAgIH0pO1xuICAgIC8vIGRvIHRoZSBvYnNlcnZpbmdcbiAgICBzY3JvbGxlZE5hdk9ic2VydmVyLm9ic2VydmUoIHNjcm9sbGVkTmF2ICk7XG5cbiAgICAvLyBvbmx5IHJlbGV2YW50IHRvIGhvbWVwYWdlXG4gICAgaWYgKCAkKFwiYm9keS5ob21lXCIpLmxlbmd0aCApIHtcbiAgICAgIC8vIHByZXAgc2VhcmNoIHRhYnMgb24gaG9tZXBhZ2VcbiAgICAgIGxldCAkcGlsbFRhYnMgPSAkKFwiI3YtcGlsbHMtdGFiXCIpLFxuICAgICAgICAgICRwaW5zID0gJHBpbGxUYWJzLmZpbmQoXCJzcGFuLmJhZGdlXCIpLFxuICAgICAgICAgICR0YWJBbGVydCA9ICQoXCIjdGFiLWNvb2tpZS1ub2ZpdGljYXRpb25cIik7XG5cbiAgICAgIC8vIHByZXZlbnQgaGFzaGVzIGluIHVybCBiYXIuIHNob3cvaGlkZSBwaW5zIGZvciBjb29raWUgc3RhdGUgc2F2aW5nXG4gICAgICAkcGlsbFRhYnMuZmluZChcImFcIikub24oXCJjbGlja1wiLCBmdW5jdGlvbihlKXtcbiAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgbGV0ICR0aGlzID0gJCh0aGlzKTtcbiAgICAgICAgICAkdGhpcy50YWIoXCJzaG93XCIpO1xuICAgICAgICAgICRwaW5zLmhpZGUoKTtcbiAgICAgICAgICAkdGhpcy5maW5kKFwic3Bhbi5iYWRnZVwiKS5zaG93KCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gZG8gdG9vbHRpcHMgZm9yIHBpbnNcbiAgICAgICRwaW5zLnRvb2x0aXAoe1xuICAgICAgICAgIGNvbnRhaW5lcjogXCJib2R5XCIsXG4gICAgICAgICAgcGxhY2VtZW50OiBcInRvcFwiLFxuICAgICAgICAgIHRpdGxlOiBcIk1ha2UgdGhpcyB5b3VyIGRlZmF1bHQgc2VhcmNoXCJcbiAgICAgIH0pO1xuXG4gICAgICAvLyBvbiBwaW4gY2xpY2sgc2V0IGNvb2tpZSBhbmQgc2hvdyBub3RpZmljYXRpb25cbiAgICAgICRwaW5zLm9uKFwiY2xpY2tcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICBsZXQgJHRoaXMgPSAkKHRoaXMpLFxuICAgICAgICAgICAgICB3aGljaCA9ICQodGhpcykuZGF0YShcInZhbHVlXCIpO1xuXG4gICAgICAgICAgJHRhYkFsZXJ0LnNob3coKTtcbiAgICAgICAgICAkcGlucy5yZW1vdmVDbGFzcyhcInRleHQtd2hpdGVcIik7XG4gICAgICAgICAgJCh0aGlzKS5hZGRDbGFzcyhcInRleHQtd2hpdGVcIik7XG5cbiAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInVudGxpYnJhcnlzZWFyY2h0YWJcIiwgd2hpY2gpO1xuXG4gICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICR0YWJBbGVydC5mYWRlVG8oNTAwLCAwKS5zbGlkZVVwKDUwMCwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICQodGhpcykuY3NzKCBcIm9wYWNpdHlcIiwgMSApO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LCA1MDAwKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyB0ZXN0IGxvY2Fsc3RvcmFnZSBmb3IgcGlubmVkIHRhYiwgaWYgbm90LCBhY3RpdmF0ZSAxc3Qgb25lLlxuICAgICAgaWYgKCBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcInVudGxpYnJhcnlzZWFyY2h0YWJcIikgKSB7XG4gICAgICAgICAgbGV0IHNhdmVkVGFiID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJ1bnRsaWJyYXJ5c2VhcmNodGFiXCIpO1xuXG4gICAgICAgICAgJHBpbGxUYWJzLmZpbmQoXCJbZGF0YS12YWx1ZT1cIiArIHNhdmVkVGFiICsgXCJdXCIpXG4gICAgICAgICAgICAgIC5jbG9zZXN0KFwiYVwiKVxuICAgICAgICAgICAgICAudGFiKFwic2hvd1wiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgJHBpbGxUYWJzLmZpbmQoXCJhXCIpLmZpcnN0KCkudGFiKFwic2hvd1wiKTtcbiAgICAgIH1cblxuICAgICAgLy8gdXNlciBjbGlja2VkIGEgaG9tZXBhZ2UgdGFiLCBmb2N1cyBvbiB0aGUgbWFpbiBzZWFyY2ggYm94LlxuICAgICAgJChcIiN2LXBpbGxzLXRhYiBhXCIpLm9uKFwic2hvd24uYnMudGFiXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgJChcIiN2LXBpbGxzLXRhYkNvbnRlbnQgLmFjdGl2ZVwiKS5maW5kKFwiaW5wdXRbdHlwZT1cXFwidGV4dFxcXCJdOmZpcnN0XCIpLmZvY3VzKCk7XG4gICAgICB9KTtcblxuXG4gICAgICBsZXQgc2F2ZWREaXNjaXBsaW5lLFxuICAgICAgICAgIHNhdmVkU2VhcmNoVHlwZSxcbiAgICAgICAgICBzYXZlZFNlYXJjaFNjb3BlLFxuICAgICAgICAgICRzdW1tb25EaXNjaXBsaW5lU2VsZWN0ID0gICQoXCIjc3VtbW9uLWRpc2NpcGxpbmVcIiksXG4gICAgICAgICAgJHN1bW1vblBhcmVudEZvcm0gPSAkKFwiI3NlYXJjaC1hcnRpY2xlcy1mb3JtXCIpLFxuICAgICAgICAgICRzZWFyY2h0eXBlU2VsZWN0ID0gJChcIiNwYXNzVGhpc1NlYXJjaHR5cGVcIiksXG4gICAgICAgICAgJHNlYXJjaFNjb3BlU2VsZWN0ID0gJChcIiNzZWFyY2hzY29wZVwiKSxcbiAgICAgICAgICAkY2F0YWxvZ1R5cGVTZWxlY3RQYXJlbnRGb3JtID0gJChcIiNzZWFyY2gtY2F0YWxvZy1mb3JtXCIpLFxuICAgICAgICAgICRpbnZlcnRBdXRob3JCdG4gPSAkKFwiI2ludmVydC1hdXRob3JcIiksXG4gICAgICAgICAgJHNlYXJjaGFyZyA9ICQoXCIjc2VhcmNoYXJnXCIpO1xuXG5cbiAgICAgIC8vIGdldCBhbmQgc2V0IHN1bW1vbiBkaXNjaXBsaW5lIGlmIHNldCBpbiBsb2NhbFN0b3JhZ2VcbiAgICAgIGlmICggbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJzdW1tb25kaXNjaXBsaW5lXCIpICl7XG4gICAgICAgICAgc2F2ZWREaXNjaXBsaW5lID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJzdW1tb25kaXNjaXBsaW5lXCIpO1xuICAgICAgICAgICRzdW1tb25EaXNjaXBsaW5lU2VsZWN0LnZhbChzYXZlZERpc2NpcGxpbmUpO1xuICAgICAgICAgICRzdW1tb25QYXJlbnRGb3JtLmRhdGEoXCJnYS1sYWJlbFwiLCBzYXZlZERpc2NpcGxpbmUpO1xuICAgICAgfVxuXG4gICAgICAvLyBSZW1lbWJlciBjaGFuZ2VzIHRvIHN1bW1vbiBkaXNjaXBsaW5lIGRyb3Bkb3duLlxuICAgICAgJHN1bW1vbkRpc2NpcGxpbmVTZWxlY3Qub24oXCJjaGFuZ2VcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICBsZXQgJHRoaXMgPSAkKHRoaXMpLFxuICAgICAgICAgICAgICB2YWwgPSAkdGhpcy52YWwoKSB8fCBcIkFueSBEaXNjaXBsaW5lXCI7XG4gICAgICAgICAgJHN1bW1vblBhcmVudEZvcm0uZGF0YShcImdhLWxhYmVsXCIsIHZhbCk7XG4gICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJzdW1tb25kaXNjaXBsaW5lXCIsIHZhbCk7XG4gICAgICB9KTtcblxuICAgICAgLy8gZG9uJ3QgcGFzcyBmaWVsZCBuYW1lcyBvZiBlbGVtZW50cyB3aXRoIG5vIHZhbHVlXG4gICAgICAkc3VtbW9uUGFyZW50Rm9ybS5zdWJtaXQoZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgbGV0ICRzdW1tb25EaXNjaXBsaW5lID0gJChcIiNzdW1tb24tZGlzY2lwbGluZVwiKSxcbiAgICAgICAgICAgIGRpc2NpcGxpbmVWYWwgPSAkc3VtbW9uRGlzY2lwbGluZS52YWwoKTtcbiAgICAgICAgaWYgKGRpc2NpcGxpbmVWYWwgPT09IHVuZGVmaW5lZCB8fCBkaXNjaXBsaW5lVmFsID09PSBcIlwiIHx8IGRpc2NpcGxpbmVWYWwgPT09IFwiQW55IERpc2NpcGxpbmVcIikge1xuICAgICAgICAgICRzdW1tb25EaXNjaXBsaW5lLmF0dHIoXCJuYW1lXCIsIFwiXCIpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuXG4gICAgICAvLyBnZXQgYW5kIHNldCBjYXRhbG9nIHNlYXJjaCB0eXBlIGlmIHNldCBpbiBsb2NhbFN0b3JhZ2VcbiAgICAgIGlmICggbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJjYXRhbG9nc2VhcmNodHlwZVwiKSApIHtcbiAgICAgICAgICBzYXZlZFNlYXJjaFR5cGUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcImNhdGFsb2dzZWFyY2h0eXBlXCIpO1xuICAgICAgICAgICRzZWFyY2h0eXBlU2VsZWN0LnZhbChzYXZlZFNlYXJjaFR5cGUpO1xuICAgICAgICAgIGxldCBzY29wZVZhbHVlID0gJHNlYXJjaFNjb3BlU2VsZWN0LnZhbCgpO1xuXG4gICAgICAgICAgJGNhdGFsb2dUeXBlU2VsZWN0UGFyZW50Rm9ybS5kYXRhKFwiZ2EtbGFiZWxcIiwgc2F2ZWRTZWFyY2hUeXBlICsgc2NvcGVWYWx1ZSk7XG4gICAgICAgICAgaWYgKHNhdmVkU2VhcmNoVHlwZSA9PT0gXCJhXCIpIHtcbiAgICAgICAgICAgICRpbnZlcnRBdXRob3JCdG4uc2hvdygpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkaW52ZXJ0QXV0aG9yQnRuLmhpZGUoKTtcbiAgICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGdldCBhbmQgc2V0IGNhdGFsb2cgc2VhcmNoIHNjb3BlIGlmIHNldCBpbiBsb2NhbFN0b3JhZ2VcbiAgICAgIGlmICggbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJjYXRhbG9nc2VhcmNoc2NvcGVcIikgKSB7XG4gICAgICAgICAgc2F2ZWRTZWFyY2hTY29wZSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiY2F0YWxvZ3NlYXJjaHNjb3BlXCIpO1xuICAgICAgICAgICRzZWFyY2hTY29wZVNlbGVjdC52YWwoc2F2ZWRTZWFyY2hTY29wZSk7XG4gICAgICAgICAgbGV0IHR5cGVWYWx1ZSA9ICRzZWFyY2h0eXBlU2VsZWN0LnZhbCgpO1xuICAgICAgICAgICRjYXRhbG9nVHlwZVNlbGVjdFBhcmVudEZvcm0uZGF0YShcImdhLWxhYmVsXCIsIHR5cGVWYWx1ZSArIHNhdmVkU2VhcmNoU2NvcGUpO1xuICAgICAgfVxuXG4gICAgICAvLyBSZW1lbWJlciBjaGFuZ2VzIHRvIGNhdGFsb2cgc2VhcmNoIHR5cGUgZHJvcGRvd24gKGtleXdvcmRzL3RpdGxlcywgZXRjLikuXG4gICAgICAkc2VhcmNodHlwZVNlbGVjdC5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpe1xuICAgICAgICAgIGxldCAkdGhpcyA9ICQodGhpcyksXG4gICAgICAgICAgICAgIHZhbCA9ICR0aGlzLnZhbCgpO1xuICAgICAgICAgICRjYXRhbG9nVHlwZVNlbGVjdFBhcmVudEZvcm0uZGF0YShcImdhLWxhYmVsXCIsIHZhbCArICRzZWFyY2hTY29wZVNlbGVjdC52YWwoKSk7XG4gICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJjYXRhbG9nc2VhcmNodHlwZVwiLCB2YWwpO1xuICAgICAgICAgIGlmICh2YWwgPT09IFwiYVwiKSB7XG4gICAgICAgICAgICAkaW52ZXJ0QXV0aG9yQnRuLnNob3coKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgJGludmVydEF1dGhvckJ0bi5oaWRlKCk7XG4gICAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFJlbWVtYmVyIGNoYW5nZXMgdG8gY2F0YWxvZyBzZWFyY2ggdHlwZSBkcm9wZG93biAoa2V5d29yZHMvdGl0bGVzLCBldGMuKS5cbiAgICAgICRzZWFyY2hTY29wZVNlbGVjdC5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpe1xuICAgICAgICAgIGxldCAkdGhpcyA9ICQodGhpcyksXG4gICAgICAgICAgICAgIHZhbCA9ICR0aGlzLnZhbCgpO1xuICAgICAgICAgICRjYXRhbG9nVHlwZVNlbGVjdFBhcmVudEZvcm0uZGF0YShcImdhLWxhYmVsXCIsICRzZWFyY2h0eXBlU2VsZWN0LnZhbCgpICsgdmFsKTtcbiAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcImNhdGFsb2dzZWFyY2hzY29wZVwiLCB2YWwpO1xuICAgICAgfSk7XG5cbiAgICAgICRpbnZlcnRBdXRob3JCdG4ub24oXCJjbGlja1wiLCBmdW5jdGlvbigpe1xuICAgICAgICBsZXQgcXVlcnlUb0FycmF5ID0gJHNlYXJjaGFyZy52YWwoKS50cmltKCkuc3BsaXQoXCIgXCIpLFxuICAgICAgICAgICAgbGFzdE5hbWUgPSBxdWVyeVRvQXJyYXkucG9wKCksXG4gICAgICAgICAgICB0aGVSZXN0ID0gcXVlcnlUb0FycmF5LmpvaW4oXCIgXCIpO1xuICAgICAgICAgICAgICAkc2VhcmNoYXJnLnZhbChsYXN0TmFtZSArIFwiLCBcIiArIHRoZVJlc3QgKTtcbiAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgLy8gV2hlbiB1c2VyIGNsaWNrcyBvbiB0aGUgc2VhcmNoIGljb24gaW4gc2l0ZSBoZWFkZXIsIGF1dG8tZm9jdXMgdGhlIGJlbnRvIGJveCBpbnB1dCBhZnRlciBkcmF3ZXIgaGFzIG9wZW5lZC5cbiAgICAkKFwiI3NlYXJjaC1kcmF3ZXJcIikub24oXCJzaG93bi5icy5tb2RhbFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICQoXCIjZHJhd2VyLXFcIikuZm9jdXMoKTtcbiAgICB9KTtcblxuICAgIC8vIHByZXR0eSBzY3JvbGwgdG8gdG9wIG9mIHRoZSBzY3JlZW4gb24gYnV0dG9uIHB1c2gsXG4gICAgJChcIiN0by10b3BcIikub24oXCJjbGlja1wiLCBmdW5jdGlvbihlKXtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAkKFwiYm9keSxodG1sXCIpLmFuaW1hdGUoe1xuICAgICAgICAgICAgc2Nyb2xsVG9wOiAwXG4gICAgICAgIH0sIDgwMCk7XG4gICAgICAgIC8vIHJlbW92ZSBoYXNoZXMgaW4gdGhlIFVSTC5cbiAgICAgICAgaGlzdG9yeS5wdXNoU3RhdGUoXCJcIiwgZG9jdW1lbnQudGl0bGUsIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArIHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICAgIH0pO1xuXG5cbiAgICAvLyBob21lcGFnZSBmZWF0dXJlIGNhcm91c2VsXG4gICAgJChcIiNmZWF0dXJlLXdyYXBwZXJcIikub24oXCJzbGlkZS5icy5jYXJvdXNlbFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAkKHRoaXMpLmZpbmQoXCIuYWN0aXZlIGFcIikuZmlyc3QoKS5mb2N1cygpO1xuICAgIH0pO1xuXG5cbiAgICAvLyBBZGQgVGFibGUgb2YgY29udGVudHMgbGlua3MgdG8gdGhlIGRyb3Bkb3duIGJlbG93IHRoZSBicmVhZGNydW1icy5cbiAgICAvLyBSZXVzZSBwcmV2aW91c2x5IHJlbmRlcmVkIGZyb20gYW5jaG9yLmpzXG4gICAgaWYgKHdpbmRvdy5hbmNob3JzICYmIGFuY2hvcnMuZWxlbWVudHMubGVuZ3RoKSB7XG4gICAgICAgIGxldCAkdG9jID0gJChcIiNwYWdlLXRvY1wiKSxcbiAgICAgICAgICAgIGl0ZW1zID0gXCJcIixcbiAgICAgICAgICAgIGVsLCB0aXRsZSwgbGluaywgYW5jO1xuXG4gICAgICAgICQoYW5jaG9ycy5lbGVtZW50cykuZWFjaChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGxldCBlbCA9ICQodGhpcyksXG4gICAgICAgICAgICAgIGFuYyA9IGVsLmZpbmQoXCIuYW5jaG9yanMtbGlua1wiKVxuICAgICAgICAgICAgICB0aXRsZSA9IGVsLnRleHQoKSxcbiAgICAgICAgICAgICAgbGluayA9IFwiI1wiICsgZWwuYXR0cihcImlkXCIpLFxuICAgICAgICAgICAgICB0b2NMaW5rID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICsgbGluayxcbiAgICAgICAgICAgICAgJGluc2VydGVkID0gYDxsaSBjbGFzcz1cInRvYy1lbnRyeSB0b2MtaDJcIj48YSBkYXRhLWdhLWNhdGVnb3J5PVwibGluayAtIFRPQ1wiIGRhdGEtZ2EtYWN0aW9uPVwicGFnZVwiIGRhdGEtZ2EtbGFiZWw9XCIke3RvY0xpbmt9XCIgaHJlZj1cIiR7bGlua31cIj4ke3RpdGxlfTwvYT48L2xpPmA7XG5cbiAgICAgICAgICAgICAgaXRlbXMgKz0gJGluc2VydGVkO1xuICAgICAgICAgICAgICBhbmMuYXR0cihcImFyaWEtbGFiZWxcIiwgXCJBbmNob3I6IFwiICsgdGl0bGUpO1xuICAgICAgICB9KTtcbiAgICAgICAgJCgkdG9jKS5hcHBlbmQoaXRlbXMpO1xuICAgIH0gZWxzZXtcbiAgICAgICAgJChcIiNwYWdlLXRvY1wiKS5oaWRlKCk7XG4gICAgfVxuXG4gICAgLy8gb2xkIHNjaG9vbCBqdW1wIG1lbnVzIGNhdXNlIHNvbWV0aW1lcyB0aGV5IGFyZSB0aGUgdG9vbCB0byB1c2UuXG4gICAgJChcImZvcm0uanVtcFwiKS5vbihcInN1Ym1pdFwiLCBmdW5jdGlvbihlKXtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBsZXQgJGp1bXBNZW51ID0gJCh0aGlzKS5maW5kKFwic2VsZWN0XCIpLFxuICAgICAgICAgICAgc2VsZWN0ZWRWYWx1ZSA9ICRqdW1wTWVudS5maW5kKFwib3B0aW9uOnNlbGVjdGVkXCIpLnZhbCgpO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZSggc2VsZWN0ZWRWYWx1ZSApO1xuICAgIH0pO1xuXG5cblxuICAgIGlmICggJChcIi5idG4uY2xpcGJvYXJkLXRyaWdnZXJcIikubGVuZ3RoICkge1xuICAgICAgICBuZXcgQ2xpcGJvYXJkSlMoXCIuYnRuLmNsaXBib2FyZC10cmlnZ2VyXCIpO1xuICAgIH1cblxuICAgIC8vIERPSSBzZWFyY2ggdXRpbGl0eS4gIElmIERPSSBkZXRlY3RlZCwgb2ZmZXIgcG9wdXAgd2l0aCBsaW5rcyBkaXJlY3RseSB0byBvYmplY3QgYW5kIHdlbGwgZm9ybWVkIHN1bW1vbiBzZWFyY2guXG4gICAgJChcImlucHV0LmRvaS10YXJnZXRcIikub24oXCJpbnB1dFwiLCBmdW5jdGlvbihlKXtcbiAgICAgIGlmIChlLm9yaWdpbmFsRXZlbnQuaW5wdXRUeXBlID09ICdpbnNlcnRGcm9tUGFzdGUnKSB7XG4gICAgICAgIGxldCAkdGhpcyA9ICQodGhpcyksXG4gICAgICAgICAgICAkaWNvbiA9ICR0aGlzLnNpYmxpbmdzKFwiLmlucHV0LWdyb3VwLWFwcGVuZFwiKS5maW5kKFwiLmRvaS1pY29uXCIpLFxuICAgICAgICAgICAgJGRvaW1vZGFsID0gJChcIiNkb2ktbW9kYWxcIiksXG4gICAgICAgICAgICAkZG9pTW9kYWxJbnB1dCA9ICQoXCIjZG9pLXRleHRcIiksXG4gICAgICAgICAgICBkb2lSZSA9IC8xMC5cXGR7NCw5fVxcL1stLl87KClcXC86QS1aMC05XSsvaWcsXG4gICAgICAgICAgICBkb2lQYXN0ZSA9ICR0aGlzLnZhbCgpLFxuICAgICAgICAgICAgZG9pID0gZG9pUGFzdGUubWF0Y2goZG9pUmUpO1xuICAgICAgICAgICAgaWYgKGRvaSkge1xuXG4gICAgICAgICAgICAgICRkb2lNb2RhbElucHV0LnZhbChkb2kpLnRyaWdnZXIoXCJjaGFuZ2VcIik7XG5cbiAgICAgICAgICAgICAgJGljb24ucmVtb3ZlQ2xhc3MoXCJkLW5vbmVcIikudG9vbHRpcCh7XG4gICAgICAgICAgICAgICAgcGxhY2VtZW50OiAndG9wJyxcbiAgICAgICAgICAgICAgICB0cmlnZ2VyOiAnbWFudWFsJ1xuICAgICAgICAgICAgICB9KS50b29sdGlwKFwic2hvd1wiKTtcblxuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgJGljb24uZm9jdXMoKTtcbiAgICAgICAgICAgICAgfSwxMDApO1xuXG4gICAgICAgICAgICAgICRpY29uLm9uKCdibHVyJywgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICRpY29uLnRvb2x0aXAoJ2hpZGUnKTtcbiAgICAgICAgICAgICAgfSk7XG5cblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgJGljb24uYWRkQ2xhc3MoXCJkLW5vbmVcIikudG9vbHRpcChcImhpZGVcIik7XG4gICAgICAgICAgICAgICRkb2lNb2RhbElucHV0LnZhbChcIlwiKS50cmlnZ2VyKFwiY2hhbmdlXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgJChcIiNkb2ktdGV4dFwiKS5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpe1xuICAgICAgICBsZXQgZG9pVmFsID0gJCh0aGlzKS52YWwoKTtcbiAgICAgICAgJChcIiNkb2ktZG9pb3JnXCIpLmF0dHIoXCJocmVmXCIsIGBodHRwczovL2xpYnByb3h5LmxpYnJhcnkudW50LmVkdS9sb2dpbj91cmw9aHR0cHM6Ly9kb2kub3JnLyR7ZG9pVmFsfWApO1xuICAgICAgICAkKFwiI2RvaS1vYWRvaW9yZ1wiKS5hdHRyKFwiaHJlZlwiLCBgaHR0cHM6Ly9vYWRvaS5vcmcvJHtkb2lWYWx9YCk7XG4gICAgICAgICQoXCIjZG9pLXN1bW1vblwiKS5hdHRyKFwiaHJlZlwiLCBgaHR0cHM6Ly91bnRleGFzLnN1bW1vbi5zZXJpYWxzc29sdXRpb25zLmNvbS9zZWFyY2gjIS9zZWFyY2g/aG89ZiZsPWVuJnE9KERPSTooJHtkb2lWYWx9KSlgKTtcbiAgICB9KTtcbn0pOyJdfQ==

