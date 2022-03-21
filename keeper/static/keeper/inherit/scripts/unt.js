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

    // Search Form Analytics Tracking
    let searchForms = document.querySelectorAll("form.search");
    for (let i = 0; i<searchForms.length; i++) {
        searchForms[i].addEventListener("submit", function(e) {
            e.preventDefault();

            let $this = $(this),
                category = $this.data("ga-category") || "form - search - untagged",
                action = $this.find("input.query").val() || "empty",
                label = $this.data("ga-label") || document.location.href,
                value = _.size(_.words(action)) || 0;

            function submitForm() {
                $this.submit();
            }
            ga("send", "event", category, action, label, value, {hitCallback: libutils.actWithTimeOut(function(){
                submitForm();
              })
            });
        });
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyc2VjdGlvbi1vYnNlcnZlci5qcyIsImxpbmtzLmpzIiwibWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcHRCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJ1bnQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENvcHlyaWdodCAyMDE2IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIFczQyBTT0ZUV0FSRSBBTkQgRE9DVU1FTlQgTk9USUNFIEFORCBMSUNFTlNFLlxuICpcbiAqICBodHRwczovL3d3dy53My5vcmcvQ29uc29ydGl1bS9MZWdhbC8yMDE1L2NvcHlyaWdodC1zb2Z0d2FyZS1hbmQtZG9jdW1lbnRcbiAqXG4gKi9cblxuKGZ1bmN0aW9uKHdpbmRvdywgZG9jdW1lbnQpIHtcbid1c2Ugc3RyaWN0JztcblxuXG4vLyBFeGl0cyBlYXJseSBpZiBhbGwgSW50ZXJzZWN0aW9uT2JzZXJ2ZXIgYW5kIEludGVyc2VjdGlvbk9ic2VydmVyRW50cnlcbi8vIGZlYXR1cmVzIGFyZSBuYXRpdmVseSBzdXBwb3J0ZWQuXG5pZiAoJ0ludGVyc2VjdGlvbk9ic2VydmVyJyBpbiB3aW5kb3cgJiZcbiAgICAnSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeScgaW4gd2luZG93ICYmXG4gICAgJ2ludGVyc2VjdGlvblJhdGlvJyBpbiB3aW5kb3cuSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeS5wcm90b3R5cGUpIHtcblxuICAvLyBNaW5pbWFsIHBvbHlmaWxsIGZvciBFZGdlIDE1J3MgbGFjayBvZiBgaXNJbnRlcnNlY3RpbmdgXG4gIC8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL3czYy9JbnRlcnNlY3Rpb25PYnNlcnZlci9pc3N1ZXMvMjExXG4gIGlmICghKCdpc0ludGVyc2VjdGluZycgaW4gd2luZG93LkludGVyc2VjdGlvbk9ic2VydmVyRW50cnkucHJvdG90eXBlKSkge1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3aW5kb3cuSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeS5wcm90b3R5cGUsXG4gICAgICAnaXNJbnRlcnNlY3RpbmcnLCB7XG4gICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW50ZXJzZWN0aW9uUmF0aW8gPiAwO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybjtcbn1cblxuXG4vKipcbiAqIEFuIEludGVyc2VjdGlvbk9ic2VydmVyIHJlZ2lzdHJ5LiBUaGlzIHJlZ2lzdHJ5IGV4aXN0cyB0byBob2xkIGEgc3Ryb25nXG4gKiByZWZlcmVuY2UgdG8gSW50ZXJzZWN0aW9uT2JzZXJ2ZXIgaW5zdGFuY2VzIGN1cnJlbnRseSBvYnNlcnZlcmluZyBhIHRhcmdldFxuICogZWxlbWVudC4gV2l0aG91dCB0aGlzIHJlZ2lzdHJ5LCBpbnN0YW5jZXMgd2l0aG91dCBhbm90aGVyIHJlZmVyZW5jZSBtYXkgYmVcbiAqIGdhcmJhZ2UgY29sbGVjdGVkLlxuICovXG52YXIgcmVnaXN0cnkgPSBbXTtcblxuXG4vKipcbiAqIENyZWF0ZXMgdGhlIGdsb2JhbCBJbnRlcnNlY3Rpb25PYnNlcnZlckVudHJ5IGNvbnN0cnVjdG9yLlxuICogaHR0cHM6Ly93M2MuZ2l0aHViLmlvL0ludGVyc2VjdGlvbk9ic2VydmVyLyNpbnRlcnNlY3Rpb24tb2JzZXJ2ZXItZW50cnlcbiAqIEBwYXJhbSB7T2JqZWN0fSBlbnRyeSBBIGRpY3Rpb25hcnkgb2YgaW5zdGFuY2UgcHJvcGVydGllcy5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBJbnRlcnNlY3Rpb25PYnNlcnZlckVudHJ5KGVudHJ5KSB7XG4gIHRoaXMudGltZSA9IGVudHJ5LnRpbWU7XG4gIHRoaXMudGFyZ2V0ID0gZW50cnkudGFyZ2V0O1xuICB0aGlzLnJvb3RCb3VuZHMgPSBlbnRyeS5yb290Qm91bmRzO1xuICB0aGlzLmJvdW5kaW5nQ2xpZW50UmVjdCA9IGVudHJ5LmJvdW5kaW5nQ2xpZW50UmVjdDtcbiAgdGhpcy5pbnRlcnNlY3Rpb25SZWN0ID0gZW50cnkuaW50ZXJzZWN0aW9uUmVjdCB8fCBnZXRFbXB0eVJlY3QoKTtcbiAgdGhpcy5pc0ludGVyc2VjdGluZyA9ICEhZW50cnkuaW50ZXJzZWN0aW9uUmVjdDtcblxuICAvLyBDYWxjdWxhdGVzIHRoZSBpbnRlcnNlY3Rpb24gcmF0aW8uXG4gIHZhciB0YXJnZXRSZWN0ID0gdGhpcy5ib3VuZGluZ0NsaWVudFJlY3Q7XG4gIHZhciB0YXJnZXRBcmVhID0gdGFyZ2V0UmVjdC53aWR0aCAqIHRhcmdldFJlY3QuaGVpZ2h0O1xuICB2YXIgaW50ZXJzZWN0aW9uUmVjdCA9IHRoaXMuaW50ZXJzZWN0aW9uUmVjdDtcbiAgdmFyIGludGVyc2VjdGlvbkFyZWEgPSBpbnRlcnNlY3Rpb25SZWN0LndpZHRoICogaW50ZXJzZWN0aW9uUmVjdC5oZWlnaHQ7XG5cbiAgLy8gU2V0cyBpbnRlcnNlY3Rpb24gcmF0aW8uXG4gIGlmICh0YXJnZXRBcmVhKSB7XG4gICAgdGhpcy5pbnRlcnNlY3Rpb25SYXRpbyA9IGludGVyc2VjdGlvbkFyZWEgLyB0YXJnZXRBcmVhO1xuICB9IGVsc2Uge1xuICAgIC8vIElmIGFyZWEgaXMgemVybyBhbmQgaXMgaW50ZXJzZWN0aW5nLCBzZXRzIHRvIDEsIG90aGVyd2lzZSB0byAwXG4gICAgdGhpcy5pbnRlcnNlY3Rpb25SYXRpbyA9IHRoaXMuaXNJbnRlcnNlY3RpbmcgPyAxIDogMDtcbiAgfVxufVxuXG5cbi8qKlxuICogQ3JlYXRlcyB0aGUgZ2xvYmFsIEludGVyc2VjdGlvbk9ic2VydmVyIGNvbnN0cnVjdG9yLlxuICogaHR0cHM6Ly93M2MuZ2l0aHViLmlvL0ludGVyc2VjdGlvbk9ic2VydmVyLyNpbnRlcnNlY3Rpb24tb2JzZXJ2ZXItaW50ZXJmYWNlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdG8gYmUgaW52b2tlZCBhZnRlciBpbnRlcnNlY3Rpb25cbiAqICAgICBjaGFuZ2VzIGhhdmUgcXVldWVkLiBUaGUgZnVuY3Rpb24gaXMgbm90IGludm9rZWQgaWYgdGhlIHF1ZXVlIGhhc1xuICogICAgIGJlZW4gZW1wdGllZCBieSBjYWxsaW5nIHRoZSBgdGFrZVJlY29yZHNgIG1ldGhvZC5cbiAqIEBwYXJhbSB7T2JqZWN0PX0gb3B0X29wdGlvbnMgT3B0aW9uYWwgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIEludGVyc2VjdGlvbk9ic2VydmVyKGNhbGxiYWNrLCBvcHRfb3B0aW9ucykge1xuXG4gIHZhciBvcHRpb25zID0gb3B0X29wdGlvbnMgfHwge307XG5cbiAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIGlmIChvcHRpb25zLnJvb3QgJiYgb3B0aW9ucy5yb290Lm5vZGVUeXBlICE9IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jvb3QgbXVzdCBiZSBhbiBFbGVtZW50Jyk7XG4gIH1cblxuICAvLyBCaW5kcyBhbmQgdGhyb3R0bGVzIGB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnNgLlxuICB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMgPSB0aHJvdHRsZShcbiAgICAgIHRoaXMuX2NoZWNrRm9ySW50ZXJzZWN0aW9ucy5iaW5kKHRoaXMpLCB0aGlzLlRIUk9UVExFX1RJTUVPVVQpO1xuXG4gIC8vIFByaXZhdGUgcHJvcGVydGllcy5cbiAgdGhpcy5fY2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgdGhpcy5fb2JzZXJ2YXRpb25UYXJnZXRzID0gW107XG4gIHRoaXMuX3F1ZXVlZEVudHJpZXMgPSBbXTtcbiAgdGhpcy5fcm9vdE1hcmdpblZhbHVlcyA9IHRoaXMuX3BhcnNlUm9vdE1hcmdpbihvcHRpb25zLnJvb3RNYXJnaW4pO1xuXG4gIC8vIFB1YmxpYyBwcm9wZXJ0aWVzLlxuICB0aGlzLnRocmVzaG9sZHMgPSB0aGlzLl9pbml0VGhyZXNob2xkcyhvcHRpb25zLnRocmVzaG9sZCk7XG4gIHRoaXMucm9vdCA9IG9wdGlvbnMucm9vdCB8fCBudWxsO1xuICB0aGlzLnJvb3RNYXJnaW4gPSB0aGlzLl9yb290TWFyZ2luVmFsdWVzLm1hcChmdW5jdGlvbihtYXJnaW4pIHtcbiAgICByZXR1cm4gbWFyZ2luLnZhbHVlICsgbWFyZ2luLnVuaXQ7XG4gIH0pLmpvaW4oJyAnKTtcbn1cblxuXG4vKipcbiAqIFRoZSBtaW5pbXVtIGludGVydmFsIHdpdGhpbiB3aGljaCB0aGUgZG9jdW1lbnQgd2lsbCBiZSBjaGVja2VkIGZvclxuICogaW50ZXJzZWN0aW9uIGNoYW5nZXMuXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5USFJPVFRMRV9USU1FT1VUID0gMTAwO1xuXG5cbi8qKlxuICogVGhlIGZyZXF1ZW5jeSBpbiB3aGljaCB0aGUgcG9seWZpbGwgcG9sbHMgZm9yIGludGVyc2VjdGlvbiBjaGFuZ2VzLlxuICogdGhpcyBjYW4gYmUgdXBkYXRlZCBvbiBhIHBlciBpbnN0YW5jZSBiYXNpcyBhbmQgbXVzdCBiZSBzZXQgcHJpb3IgdG9cbiAqIGNhbGxpbmcgYG9ic2VydmVgIG9uIHRoZSBmaXJzdCB0YXJnZXQuXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5QT0xMX0lOVEVSVkFMID0gbnVsbDtcblxuLyoqXG4gKiBVc2UgYSBtdXRhdGlvbiBvYnNlcnZlciBvbiB0aGUgcm9vdCBlbGVtZW50XG4gKiB0byBkZXRlY3QgaW50ZXJzZWN0aW9uIGNoYW5nZXMuXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5VU0VfTVVUQVRJT05fT0JTRVJWRVIgPSB0cnVlO1xuXG5cbi8qKlxuICogU3RhcnRzIG9ic2VydmluZyBhIHRhcmdldCBlbGVtZW50IGZvciBpbnRlcnNlY3Rpb24gY2hhbmdlcyBiYXNlZCBvblxuICogdGhlIHRocmVzaG9sZHMgdmFsdWVzLlxuICogQHBhcmFtIHtFbGVtZW50fSB0YXJnZXQgVGhlIERPTSBlbGVtZW50IHRvIG9ic2VydmUuXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5vYnNlcnZlID0gZnVuY3Rpb24odGFyZ2V0KSB7XG4gIHZhciBpc1RhcmdldEFscmVhZHlPYnNlcnZlZCA9IHRoaXMuX29ic2VydmF0aW9uVGFyZ2V0cy5zb21lKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5lbGVtZW50ID09IHRhcmdldDtcbiAgfSk7XG5cbiAgaWYgKGlzVGFyZ2V0QWxyZWFkeU9ic2VydmVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCEodGFyZ2V0ICYmIHRhcmdldC5ub2RlVHlwZSA9PSAxKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigndGFyZ2V0IG11c3QgYmUgYW4gRWxlbWVudCcpO1xuICB9XG5cbiAgdGhpcy5fcmVnaXN0ZXJJbnN0YW5jZSgpO1xuICB0aGlzLl9vYnNlcnZhdGlvblRhcmdldHMucHVzaCh7ZWxlbWVudDogdGFyZ2V0LCBlbnRyeTogbnVsbH0pO1xuICB0aGlzLl9tb25pdG9ySW50ZXJzZWN0aW9ucygpO1xuICB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMoKTtcbn07XG5cblxuLyoqXG4gKiBTdG9wcyBvYnNlcnZpbmcgYSB0YXJnZXQgZWxlbWVudCBmb3IgaW50ZXJzZWN0aW9uIGNoYW5nZXMuXG4gKiBAcGFyYW0ge0VsZW1lbnR9IHRhcmdldCBUaGUgRE9NIGVsZW1lbnQgdG8gb2JzZXJ2ZS5cbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLnVub2JzZXJ2ZSA9IGZ1bmN0aW9uKHRhcmdldCkge1xuICB0aGlzLl9vYnNlcnZhdGlvblRhcmdldHMgPVxuICAgICAgdGhpcy5fb2JzZXJ2YXRpb25UYXJnZXRzLmZpbHRlcihmdW5jdGlvbihpdGVtKSB7XG5cbiAgICByZXR1cm4gaXRlbS5lbGVtZW50ICE9IHRhcmdldDtcbiAgfSk7XG4gIGlmICghdGhpcy5fb2JzZXJ2YXRpb25UYXJnZXRzLmxlbmd0aCkge1xuICAgIHRoaXMuX3VubW9uaXRvckludGVyc2VjdGlvbnMoKTtcbiAgICB0aGlzLl91bnJlZ2lzdGVySW5zdGFuY2UoKTtcbiAgfVxufTtcblxuXG4vKipcbiAqIFN0b3BzIG9ic2VydmluZyBhbGwgdGFyZ2V0IGVsZW1lbnRzIGZvciBpbnRlcnNlY3Rpb24gY2hhbmdlcy5cbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLmRpc2Nvbm5lY3QgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5fb2JzZXJ2YXRpb25UYXJnZXRzID0gW107XG4gIHRoaXMuX3VubW9uaXRvckludGVyc2VjdGlvbnMoKTtcbiAgdGhpcy5fdW5yZWdpc3Rlckluc3RhbmNlKCk7XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyBhbnkgcXVldWUgZW50cmllcyB0aGF0IGhhdmUgbm90IHlldCBiZWVuIHJlcG9ydGVkIHRvIHRoZVxuICogY2FsbGJhY2sgYW5kIGNsZWFycyB0aGUgcXVldWUuIFRoaXMgY2FuIGJlIHVzZWQgaW4gY29uanVuY3Rpb24gd2l0aCB0aGVcbiAqIGNhbGxiYWNrIHRvIG9idGFpbiB0aGUgYWJzb2x1dGUgbW9zdCB1cC10by1kYXRlIGludGVyc2VjdGlvbiBpbmZvcm1hdGlvbi5cbiAqIEByZXR1cm4ge0FycmF5fSBUaGUgY3VycmVudGx5IHF1ZXVlZCBlbnRyaWVzLlxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUudGFrZVJlY29yZHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJlY29yZHMgPSB0aGlzLl9xdWV1ZWRFbnRyaWVzLnNsaWNlKCk7XG4gIHRoaXMuX3F1ZXVlZEVudHJpZXMgPSBbXTtcbiAgcmV0dXJuIHJlY29yZHM7XG59O1xuXG5cbi8qKlxuICogQWNjZXB0cyB0aGUgdGhyZXNob2xkIHZhbHVlIGZyb20gdGhlIHVzZXIgY29uZmlndXJhdGlvbiBvYmplY3QgYW5kXG4gKiByZXR1cm5zIGEgc29ydGVkIGFycmF5IG9mIHVuaXF1ZSB0aHJlc2hvbGQgdmFsdWVzLiBJZiBhIHZhbHVlIGlzIG5vdFxuICogYmV0d2VlbiAwIGFuZCAxIGFuZCBlcnJvciBpcyB0aHJvd24uXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtBcnJheXxudW1iZXI9fSBvcHRfdGhyZXNob2xkIEFuIG9wdGlvbmFsIHRocmVzaG9sZCB2YWx1ZSBvclxuICogICAgIGEgbGlzdCBvZiB0aHJlc2hvbGQgdmFsdWVzLCBkZWZhdWx0aW5nIHRvIFswXS5cbiAqIEByZXR1cm4ge0FycmF5fSBBIHNvcnRlZCBsaXN0IG9mIHVuaXF1ZSBhbmQgdmFsaWQgdGhyZXNob2xkIHZhbHVlcy5cbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLl9pbml0VGhyZXNob2xkcyA9IGZ1bmN0aW9uKG9wdF90aHJlc2hvbGQpIHtcbiAgdmFyIHRocmVzaG9sZCA9IG9wdF90aHJlc2hvbGQgfHwgWzBdO1xuICBpZiAoIUFycmF5LmlzQXJyYXkodGhyZXNob2xkKSkgdGhyZXNob2xkID0gW3RocmVzaG9sZF07XG5cbiAgcmV0dXJuIHRocmVzaG9sZC5zb3J0KCkuZmlsdGVyKGZ1bmN0aW9uKHQsIGksIGEpIHtcbiAgICBpZiAodHlwZW9mIHQgIT0gJ251bWJlcicgfHwgaXNOYU4odCkgfHwgdCA8IDAgfHwgdCA+IDEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndGhyZXNob2xkIG11c3QgYmUgYSBudW1iZXIgYmV0d2VlbiAwIGFuZCAxIGluY2x1c2l2ZWx5Jyk7XG4gICAgfVxuICAgIHJldHVybiB0ICE9PSBhW2kgLSAxXTtcbiAgfSk7XG59O1xuXG5cbi8qKlxuICogQWNjZXB0cyB0aGUgcm9vdE1hcmdpbiB2YWx1ZSBmcm9tIHRoZSB1c2VyIGNvbmZpZ3VyYXRpb24gb2JqZWN0XG4gKiBhbmQgcmV0dXJucyBhbiBhcnJheSBvZiB0aGUgZm91ciBtYXJnaW4gdmFsdWVzIGFzIGFuIG9iamVjdCBjb250YWluaW5nXG4gKiB0aGUgdmFsdWUgYW5kIHVuaXQgcHJvcGVydGllcy4gSWYgYW55IG9mIHRoZSB2YWx1ZXMgYXJlIG5vdCBwcm9wZXJseVxuICogZm9ybWF0dGVkIG9yIHVzZSBhIHVuaXQgb3RoZXIgdGhhbiBweCBvciAlLCBhbmQgZXJyb3IgaXMgdGhyb3duLlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7c3RyaW5nPX0gb3B0X3Jvb3RNYXJnaW4gQW4gb3B0aW9uYWwgcm9vdE1hcmdpbiB2YWx1ZSxcbiAqICAgICBkZWZhdWx0aW5nIHRvICcwcHgnLlxuICogQHJldHVybiB7QXJyYXk8T2JqZWN0Pn0gQW4gYXJyYXkgb2YgbWFyZ2luIG9iamVjdHMgd2l0aCB0aGUga2V5c1xuICogICAgIHZhbHVlIGFuZCB1bml0LlxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX3BhcnNlUm9vdE1hcmdpbiA9IGZ1bmN0aW9uKG9wdF9yb290TWFyZ2luKSB7XG4gIHZhciBtYXJnaW5TdHJpbmcgPSBvcHRfcm9vdE1hcmdpbiB8fCAnMHB4JztcbiAgdmFyIG1hcmdpbnMgPSBtYXJnaW5TdHJpbmcuc3BsaXQoL1xccysvKS5tYXAoZnVuY3Rpb24obWFyZ2luKSB7XG4gICAgdmFyIHBhcnRzID0gL14oLT9cXGQqXFwuP1xcZCspKHB4fCUpJC8uZXhlYyhtYXJnaW4pO1xuICAgIGlmICghcGFydHMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigncm9vdE1hcmdpbiBtdXN0IGJlIHNwZWNpZmllZCBpbiBwaXhlbHMgb3IgcGVyY2VudCcpO1xuICAgIH1cbiAgICByZXR1cm4ge3ZhbHVlOiBwYXJzZUZsb2F0KHBhcnRzWzFdKSwgdW5pdDogcGFydHNbMl19O1xuICB9KTtcblxuICAvLyBIYW5kbGVzIHNob3J0aGFuZC5cbiAgbWFyZ2luc1sxXSA9IG1hcmdpbnNbMV0gfHwgbWFyZ2luc1swXTtcbiAgbWFyZ2luc1syXSA9IG1hcmdpbnNbMl0gfHwgbWFyZ2luc1swXTtcbiAgbWFyZ2luc1szXSA9IG1hcmdpbnNbM10gfHwgbWFyZ2luc1sxXTtcblxuICByZXR1cm4gbWFyZ2lucztcbn07XG5cblxuLyoqXG4gKiBTdGFydHMgcG9sbGluZyBmb3IgaW50ZXJzZWN0aW9uIGNoYW5nZXMgaWYgdGhlIHBvbGxpbmcgaXMgbm90IGFscmVhZHlcbiAqIGhhcHBlbmluZywgYW5kIGlmIHRoZSBwYWdlJ3MgdmlzaWJpbHR5IHN0YXRlIGlzIHZpc2libGUuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX21vbml0b3JJbnRlcnNlY3Rpb25zID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5fbW9uaXRvcmluZ0ludGVyc2VjdGlvbnMpIHtcbiAgICB0aGlzLl9tb25pdG9yaW5nSW50ZXJzZWN0aW9ucyA9IHRydWU7XG5cbiAgICAvLyBJZiBhIHBvbGwgaW50ZXJ2YWwgaXMgc2V0LCB1c2UgcG9sbGluZyBpbnN0ZWFkIG9mIGxpc3RlbmluZyB0b1xuICAgIC8vIHJlc2l6ZSBhbmQgc2Nyb2xsIGV2ZW50cyBvciBET00gbXV0YXRpb25zLlxuICAgIGlmICh0aGlzLlBPTExfSU5URVJWQUwpIHtcbiAgICAgIHRoaXMuX21vbml0b3JpbmdJbnRlcnZhbCA9IHNldEludGVydmFsKFxuICAgICAgICAgIHRoaXMuX2NoZWNrRm9ySW50ZXJzZWN0aW9ucywgdGhpcy5QT0xMX0lOVEVSVkFMKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBhZGRFdmVudCh3aW5kb3csICdyZXNpemUnLCB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMsIHRydWUpO1xuICAgICAgYWRkRXZlbnQoZG9jdW1lbnQsICdzY3JvbGwnLCB0aGlzLl9jaGVja0ZvckludGVyc2VjdGlvbnMsIHRydWUpO1xuXG4gICAgICBpZiAodGhpcy5VU0VfTVVUQVRJT05fT0JTRVJWRVIgJiYgJ011dGF0aW9uT2JzZXJ2ZXInIGluIHdpbmRvdykge1xuICAgICAgICB0aGlzLl9kb21PYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKHRoaXMuX2NoZWNrRm9ySW50ZXJzZWN0aW9ucyk7XG4gICAgICAgIHRoaXMuX2RvbU9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQsIHtcbiAgICAgICAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgICAgICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICAgICAgICBjaGFyYWN0ZXJEYXRhOiB0cnVlLFxuICAgICAgICAgIHN1YnRyZWU6IHRydWVcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5cbi8qKlxuICogU3RvcHMgcG9sbGluZyBmb3IgaW50ZXJzZWN0aW9uIGNoYW5nZXMuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX3VubW9uaXRvckludGVyc2VjdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuX21vbml0b3JpbmdJbnRlcnNlY3Rpb25zKSB7XG4gICAgdGhpcy5fbW9uaXRvcmluZ0ludGVyc2VjdGlvbnMgPSBmYWxzZTtcblxuICAgIGNsZWFySW50ZXJ2YWwodGhpcy5fbW9uaXRvcmluZ0ludGVydmFsKTtcbiAgICB0aGlzLl9tb25pdG9yaW5nSW50ZXJ2YWwgPSBudWxsO1xuXG4gICAgcmVtb3ZlRXZlbnQod2luZG93LCAncmVzaXplJywgdGhpcy5fY2hlY2tGb3JJbnRlcnNlY3Rpb25zLCB0cnVlKTtcbiAgICByZW1vdmVFdmVudChkb2N1bWVudCwgJ3Njcm9sbCcsIHRoaXMuX2NoZWNrRm9ySW50ZXJzZWN0aW9ucywgdHJ1ZSk7XG5cbiAgICBpZiAodGhpcy5fZG9tT2JzZXJ2ZXIpIHtcbiAgICAgIHRoaXMuX2RvbU9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICAgIHRoaXMuX2RvbU9ic2VydmVyID0gbnVsbDtcbiAgICB9XG4gIH1cbn07XG5cblxuLyoqXG4gKiBTY2FucyBlYWNoIG9ic2VydmF0aW9uIHRhcmdldCBmb3IgaW50ZXJzZWN0aW9uIGNoYW5nZXMgYW5kIGFkZHMgdGhlbVxuICogdG8gdGhlIGludGVybmFsIGVudHJpZXMgcXVldWUuIElmIG5ldyBlbnRyaWVzIGFyZSBmb3VuZCwgaXRcbiAqIHNjaGVkdWxlcyB0aGUgY2FsbGJhY2sgdG8gYmUgaW52b2tlZC5cbiAqIEBwcml2YXRlXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5fY2hlY2tGb3JJbnRlcnNlY3Rpb25zID0gZnVuY3Rpb24oKSB7XG4gIHZhciByb290SXNJbkRvbSA9IHRoaXMuX3Jvb3RJc0luRG9tKCk7XG4gIHZhciByb290UmVjdCA9IHJvb3RJc0luRG9tID8gdGhpcy5fZ2V0Um9vdFJlY3QoKSA6IGdldEVtcHR5UmVjdCgpO1xuXG4gIHRoaXMuX29ic2VydmF0aW9uVGFyZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICB2YXIgdGFyZ2V0ID0gaXRlbS5lbGVtZW50O1xuICAgIHZhciB0YXJnZXRSZWN0ID0gZ2V0Qm91bmRpbmdDbGllbnRSZWN0KHRhcmdldCk7XG4gICAgdmFyIHJvb3RDb250YWluc1RhcmdldCA9IHRoaXMuX3Jvb3RDb250YWluc1RhcmdldCh0YXJnZXQpO1xuICAgIHZhciBvbGRFbnRyeSA9IGl0ZW0uZW50cnk7XG4gICAgdmFyIGludGVyc2VjdGlvblJlY3QgPSByb290SXNJbkRvbSAmJiByb290Q29udGFpbnNUYXJnZXQgJiZcbiAgICAgICAgdGhpcy5fY29tcHV0ZVRhcmdldEFuZFJvb3RJbnRlcnNlY3Rpb24odGFyZ2V0LCByb290UmVjdCk7XG5cbiAgICB2YXIgbmV3RW50cnkgPSBpdGVtLmVudHJ5ID0gbmV3IEludGVyc2VjdGlvbk9ic2VydmVyRW50cnkoe1xuICAgICAgdGltZTogbm93KCksXG4gICAgICB0YXJnZXQ6IHRhcmdldCxcbiAgICAgIGJvdW5kaW5nQ2xpZW50UmVjdDogdGFyZ2V0UmVjdCxcbiAgICAgIHJvb3RCb3VuZHM6IHJvb3RSZWN0LFxuICAgICAgaW50ZXJzZWN0aW9uUmVjdDogaW50ZXJzZWN0aW9uUmVjdFxuICAgIH0pO1xuXG4gICAgaWYgKCFvbGRFbnRyeSkge1xuICAgICAgdGhpcy5fcXVldWVkRW50cmllcy5wdXNoKG5ld0VudHJ5KTtcbiAgICB9IGVsc2UgaWYgKHJvb3RJc0luRG9tICYmIHJvb3RDb250YWluc1RhcmdldCkge1xuICAgICAgLy8gSWYgdGhlIG5ldyBlbnRyeSBpbnRlcnNlY3Rpb24gcmF0aW8gaGFzIGNyb3NzZWQgYW55IG9mIHRoZVxuICAgICAgLy8gdGhyZXNob2xkcywgYWRkIGEgbmV3IGVudHJ5LlxuICAgICAgaWYgKHRoaXMuX2hhc0Nyb3NzZWRUaHJlc2hvbGQob2xkRW50cnksIG5ld0VudHJ5KSkge1xuICAgICAgICB0aGlzLl9xdWV1ZWRFbnRyaWVzLnB1c2gobmV3RW50cnkpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBJZiB0aGUgcm9vdCBpcyBub3QgaW4gdGhlIERPTSBvciB0YXJnZXQgaXMgbm90IGNvbnRhaW5lZCB3aXRoaW5cbiAgICAgIC8vIHJvb3QgYnV0IHRoZSBwcmV2aW91cyBlbnRyeSBmb3IgdGhpcyB0YXJnZXQgaGFkIGFuIGludGVyc2VjdGlvbixcbiAgICAgIC8vIGFkZCBhIG5ldyByZWNvcmQgaW5kaWNhdGluZyByZW1vdmFsLlxuICAgICAgaWYgKG9sZEVudHJ5ICYmIG9sZEVudHJ5LmlzSW50ZXJzZWN0aW5nKSB7XG4gICAgICAgIHRoaXMuX3F1ZXVlZEVudHJpZXMucHVzaChuZXdFbnRyeSk7XG4gICAgICB9XG4gICAgfVxuICB9LCB0aGlzKTtcblxuICBpZiAodGhpcy5fcXVldWVkRW50cmllcy5sZW5ndGgpIHtcbiAgICB0aGlzLl9jYWxsYmFjayh0aGlzLnRha2VSZWNvcmRzKCksIHRoaXMpO1xuICB9XG59O1xuXG5cbi8qKlxuICogQWNjZXB0cyBhIHRhcmdldCBhbmQgcm9vdCByZWN0IGNvbXB1dGVzIHRoZSBpbnRlcnNlY3Rpb24gYmV0d2VlbiB0aGVuXG4gKiBmb2xsb3dpbmcgdGhlIGFsZ29yaXRobSBpbiB0aGUgc3BlYy5cbiAqIFRPRE8ocGhpbGlwd2FsdG9uKTogYXQgdGhpcyB0aW1lIGNsaXAtcGF0aCBpcyBub3QgY29uc2lkZXJlZC5cbiAqIGh0dHBzOi8vdzNjLmdpdGh1Yi5pby9JbnRlcnNlY3Rpb25PYnNlcnZlci8jY2FsY3VsYXRlLWludGVyc2VjdGlvbi1yZWN0LWFsZ29cbiAqIEBwYXJhbSB7RWxlbWVudH0gdGFyZ2V0IFRoZSB0YXJnZXQgRE9NIGVsZW1lbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSByb290UmVjdCBUaGUgYm91bmRpbmcgcmVjdCBvZiB0aGUgcm9vdCBhZnRlciBiZWluZ1xuICogICAgIGV4cGFuZGVkIGJ5IHRoZSByb290TWFyZ2luIHZhbHVlLlxuICogQHJldHVybiB7P09iamVjdH0gVGhlIGZpbmFsIGludGVyc2VjdGlvbiByZWN0IG9iamVjdCBvciB1bmRlZmluZWQgaWYgbm9cbiAqICAgICBpbnRlcnNlY3Rpb24gaXMgZm91bmQuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX2NvbXB1dGVUYXJnZXRBbmRSb290SW50ZXJzZWN0aW9uID1cbiAgICBmdW5jdGlvbih0YXJnZXQsIHJvb3RSZWN0KSB7XG5cbiAgLy8gSWYgdGhlIGVsZW1lbnQgaXNuJ3QgZGlzcGxheWVkLCBhbiBpbnRlcnNlY3Rpb24gY2FuJ3QgaGFwcGVuLlxuICBpZiAod2luZG93LmdldENvbXB1dGVkU3R5bGUodGFyZ2V0KS5kaXNwbGF5ID09ICdub25lJykgcmV0dXJuO1xuXG4gIHZhciB0YXJnZXRSZWN0ID0gZ2V0Qm91bmRpbmdDbGllbnRSZWN0KHRhcmdldCk7XG4gIHZhciBpbnRlcnNlY3Rpb25SZWN0ID0gdGFyZ2V0UmVjdDtcbiAgdmFyIHBhcmVudCA9IGdldFBhcmVudE5vZGUodGFyZ2V0KTtcbiAgdmFyIGF0Um9vdCA9IGZhbHNlO1xuXG4gIHdoaWxlICghYXRSb290KSB7XG4gICAgdmFyIHBhcmVudFJlY3QgPSBudWxsO1xuICAgIHZhciBwYXJlbnRDb21wdXRlZFN0eWxlID0gcGFyZW50Lm5vZGVUeXBlID09IDEgP1xuICAgICAgICB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShwYXJlbnQpIDoge307XG5cbiAgICAvLyBJZiB0aGUgcGFyZW50IGlzbid0IGRpc3BsYXllZCwgYW4gaW50ZXJzZWN0aW9uIGNhbid0IGhhcHBlbi5cbiAgICBpZiAocGFyZW50Q29tcHV0ZWRTdHlsZS5kaXNwbGF5ID09ICdub25lJykgcmV0dXJuO1xuXG4gICAgaWYgKHBhcmVudCA9PSB0aGlzLnJvb3QgfHwgcGFyZW50ID09IGRvY3VtZW50KSB7XG4gICAgICBhdFJvb3QgPSB0cnVlO1xuICAgICAgcGFyZW50UmVjdCA9IHJvb3RSZWN0O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBJZiB0aGUgZWxlbWVudCBoYXMgYSBub24tdmlzaWJsZSBvdmVyZmxvdywgYW5kIGl0J3Mgbm90IHRoZSA8Ym9keT5cbiAgICAgIC8vIG9yIDxodG1sPiBlbGVtZW50LCB1cGRhdGUgdGhlIGludGVyc2VjdGlvbiByZWN0LlxuICAgICAgLy8gTm90ZTogPGJvZHk+IGFuZCA8aHRtbD4gY2Fubm90IGJlIGNsaXBwZWQgdG8gYSByZWN0IHRoYXQncyBub3QgYWxzb1xuICAgICAgLy8gdGhlIGRvY3VtZW50IHJlY3QsIHNvIG5vIG5lZWQgdG8gY29tcHV0ZSBhIG5ldyBpbnRlcnNlY3Rpb24uXG4gICAgICBpZiAocGFyZW50ICE9IGRvY3VtZW50LmJvZHkgJiZcbiAgICAgICAgICBwYXJlbnQgIT0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50ICYmXG4gICAgICAgICAgcGFyZW50Q29tcHV0ZWRTdHlsZS5vdmVyZmxvdyAhPSAndmlzaWJsZScpIHtcbiAgICAgICAgcGFyZW50UmVjdCA9IGdldEJvdW5kaW5nQ2xpZW50UmVjdChwYXJlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIElmIGVpdGhlciBvZiB0aGUgYWJvdmUgY29uZGl0aW9uYWxzIHNldCBhIG5ldyBwYXJlbnRSZWN0LFxuICAgIC8vIGNhbGN1bGF0ZSBuZXcgaW50ZXJzZWN0aW9uIGRhdGEuXG4gICAgaWYgKHBhcmVudFJlY3QpIHtcbiAgICAgIGludGVyc2VjdGlvblJlY3QgPSBjb21wdXRlUmVjdEludGVyc2VjdGlvbihwYXJlbnRSZWN0LCBpbnRlcnNlY3Rpb25SZWN0KTtcblxuICAgICAgaWYgKCFpbnRlcnNlY3Rpb25SZWN0KSBicmVhaztcbiAgICB9XG4gICAgcGFyZW50ID0gZ2V0UGFyZW50Tm9kZShwYXJlbnQpO1xuICB9XG4gIHJldHVybiBpbnRlcnNlY3Rpb25SZWN0O1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIHJvb3QgcmVjdCBhZnRlciBiZWluZyBleHBhbmRlZCBieSB0aGUgcm9vdE1hcmdpbiB2YWx1ZS5cbiAqIEByZXR1cm4ge09iamVjdH0gVGhlIGV4cGFuZGVkIHJvb3QgcmVjdC5cbiAqIEBwcml2YXRlXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5fZ2V0Um9vdFJlY3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJvb3RSZWN0O1xuICBpZiAodGhpcy5yb290KSB7XG4gICAgcm9vdFJlY3QgPSBnZXRCb3VuZGluZ0NsaWVudFJlY3QodGhpcy5yb290KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBVc2UgPGh0bWw+Lzxib2R5PiBpbnN0ZWFkIG9mIHdpbmRvdyBzaW5jZSBzY3JvbGwgYmFycyBhZmZlY3Qgc2l6ZS5cbiAgICB2YXIgaHRtbCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgICB2YXIgYm9keSA9IGRvY3VtZW50LmJvZHk7XG4gICAgcm9vdFJlY3QgPSB7XG4gICAgICB0b3A6IDAsXG4gICAgICBsZWZ0OiAwLFxuICAgICAgcmlnaHQ6IGh0bWwuY2xpZW50V2lkdGggfHwgYm9keS5jbGllbnRXaWR0aCxcbiAgICAgIHdpZHRoOiBodG1sLmNsaWVudFdpZHRoIHx8IGJvZHkuY2xpZW50V2lkdGgsXG4gICAgICBib3R0b206IGh0bWwuY2xpZW50SGVpZ2h0IHx8IGJvZHkuY2xpZW50SGVpZ2h0LFxuICAgICAgaGVpZ2h0OiBodG1sLmNsaWVudEhlaWdodCB8fCBib2R5LmNsaWVudEhlaWdodFxuICAgIH07XG4gIH1cbiAgcmV0dXJuIHRoaXMuX2V4cGFuZFJlY3RCeVJvb3RNYXJnaW4ocm9vdFJlY3QpO1xufTtcblxuXG4vKipcbiAqIEFjY2VwdHMgYSByZWN0IGFuZCBleHBhbmRzIGl0IGJ5IHRoZSByb290TWFyZ2luIHZhbHVlLlxuICogQHBhcmFtIHtPYmplY3R9IHJlY3QgVGhlIHJlY3Qgb2JqZWN0IHRvIGV4cGFuZC5cbiAqIEByZXR1cm4ge09iamVjdH0gVGhlIGV4cGFuZGVkIHJlY3QuXG4gKiBAcHJpdmF0ZVxuICovXG5JbnRlcnNlY3Rpb25PYnNlcnZlci5wcm90b3R5cGUuX2V4cGFuZFJlY3RCeVJvb3RNYXJnaW4gPSBmdW5jdGlvbihyZWN0KSB7XG4gIHZhciBtYXJnaW5zID0gdGhpcy5fcm9vdE1hcmdpblZhbHVlcy5tYXAoZnVuY3Rpb24obWFyZ2luLCBpKSB7XG4gICAgcmV0dXJuIG1hcmdpbi51bml0ID09ICdweCcgPyBtYXJnaW4udmFsdWUgOlxuICAgICAgICBtYXJnaW4udmFsdWUgKiAoaSAlIDIgPyByZWN0LndpZHRoIDogcmVjdC5oZWlnaHQpIC8gMTAwO1xuICB9KTtcbiAgdmFyIG5ld1JlY3QgPSB7XG4gICAgdG9wOiByZWN0LnRvcCAtIG1hcmdpbnNbMF0sXG4gICAgcmlnaHQ6IHJlY3QucmlnaHQgKyBtYXJnaW5zWzFdLFxuICAgIGJvdHRvbTogcmVjdC5ib3R0b20gKyBtYXJnaW5zWzJdLFxuICAgIGxlZnQ6IHJlY3QubGVmdCAtIG1hcmdpbnNbM11cbiAgfTtcbiAgbmV3UmVjdC53aWR0aCA9IG5ld1JlY3QucmlnaHQgLSBuZXdSZWN0LmxlZnQ7XG4gIG5ld1JlY3QuaGVpZ2h0ID0gbmV3UmVjdC5ib3R0b20gLSBuZXdSZWN0LnRvcDtcblxuICByZXR1cm4gbmV3UmVjdDtcbn07XG5cblxuLyoqXG4gKiBBY2NlcHRzIGFuIG9sZCBhbmQgbmV3IGVudHJ5IGFuZCByZXR1cm5zIHRydWUgaWYgYXQgbGVhc3Qgb25lIG9mIHRoZVxuICogdGhyZXNob2xkIHZhbHVlcyBoYXMgYmVlbiBjcm9zc2VkLlxuICogQHBhcmFtIHs/SW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeX0gb2xkRW50cnkgVGhlIHByZXZpb3VzIGVudHJ5IGZvciBhXG4gKiAgICBwYXJ0aWN1bGFyIHRhcmdldCBlbGVtZW50IG9yIG51bGwgaWYgbm8gcHJldmlvdXMgZW50cnkgZXhpc3RzLlxuICogQHBhcmFtIHtJbnRlcnNlY3Rpb25PYnNlcnZlckVudHJ5fSBuZXdFbnRyeSBUaGUgY3VycmVudCBlbnRyeSBmb3IgYVxuICogICAgcGFydGljdWxhciB0YXJnZXQgZWxlbWVudC5cbiAqIEByZXR1cm4ge2Jvb2xlYW59IFJldHVybnMgdHJ1ZSBpZiBhIGFueSB0aHJlc2hvbGQgaGFzIGJlZW4gY3Jvc3NlZC5cbiAqIEBwcml2YXRlXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5faGFzQ3Jvc3NlZFRocmVzaG9sZCA9XG4gICAgZnVuY3Rpb24ob2xkRW50cnksIG5ld0VudHJ5KSB7XG5cbiAgLy8gVG8gbWFrZSBjb21wYXJpbmcgZWFzaWVyLCBhbiBlbnRyeSB0aGF0IGhhcyBhIHJhdGlvIG9mIDBcbiAgLy8gYnV0IGRvZXMgbm90IGFjdHVhbGx5IGludGVyc2VjdCBpcyBnaXZlbiBhIHZhbHVlIG9mIC0xXG4gIHZhciBvbGRSYXRpbyA9IG9sZEVudHJ5ICYmIG9sZEVudHJ5LmlzSW50ZXJzZWN0aW5nID9cbiAgICAgIG9sZEVudHJ5LmludGVyc2VjdGlvblJhdGlvIHx8IDAgOiAtMTtcbiAgdmFyIG5ld1JhdGlvID0gbmV3RW50cnkuaXNJbnRlcnNlY3RpbmcgP1xuICAgICAgbmV3RW50cnkuaW50ZXJzZWN0aW9uUmF0aW8gfHwgMCA6IC0xO1xuXG4gIC8vIElnbm9yZSB1bmNoYW5nZWQgcmF0aW9zXG4gIGlmIChvbGRSYXRpbyA9PT0gbmV3UmF0aW8pIHJldHVybjtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMudGhyZXNob2xkcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB0aHJlc2hvbGQgPSB0aGlzLnRocmVzaG9sZHNbaV07XG5cbiAgICAvLyBSZXR1cm4gdHJ1ZSBpZiBhbiBlbnRyeSBtYXRjaGVzIGEgdGhyZXNob2xkIG9yIGlmIHRoZSBuZXcgcmF0aW9cbiAgICAvLyBhbmQgdGhlIG9sZCByYXRpbyBhcmUgb24gdGhlIG9wcG9zaXRlIHNpZGVzIG9mIGEgdGhyZXNob2xkLlxuICAgIGlmICh0aHJlc2hvbGQgPT0gb2xkUmF0aW8gfHwgdGhyZXNob2xkID09IG5ld1JhdGlvIHx8XG4gICAgICAgIHRocmVzaG9sZCA8IG9sZFJhdGlvICE9PSB0aHJlc2hvbGQgPCBuZXdSYXRpbykge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG59O1xuXG5cbi8qKlxuICogUmV0dXJucyB3aGV0aGVyIG9yIG5vdCB0aGUgcm9vdCBlbGVtZW50IGlzIGFuIGVsZW1lbnQgYW5kIGlzIGluIHRoZSBET00uXG4gKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSByb290IGVsZW1lbnQgaXMgYW4gZWxlbWVudCBhbmQgaXMgaW4gdGhlIERPTS5cbiAqIEBwcml2YXRlXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5fcm9vdElzSW5Eb20gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICF0aGlzLnJvb3QgfHwgY29udGFpbnNEZWVwKGRvY3VtZW50LCB0aGlzLnJvb3QpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciBvciBub3QgdGhlIHRhcmdldCBlbGVtZW50IGlzIGEgY2hpbGQgb2Ygcm9vdC5cbiAqIEBwYXJhbSB7RWxlbWVudH0gdGFyZ2V0IFRoZSB0YXJnZXQgZWxlbWVudCB0byBjaGVjay5cbiAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIHRhcmdldCBlbGVtZW50IGlzIGEgY2hpbGQgb2Ygcm9vdC5cbiAqIEBwcml2YXRlXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5fcm9vdENvbnRhaW5zVGFyZ2V0ID0gZnVuY3Rpb24odGFyZ2V0KSB7XG4gIHJldHVybiBjb250YWluc0RlZXAodGhpcy5yb290IHx8IGRvY3VtZW50LCB0YXJnZXQpO1xufTtcblxuXG4vKipcbiAqIEFkZHMgdGhlIGluc3RhbmNlIHRvIHRoZSBnbG9iYWwgSW50ZXJzZWN0aW9uT2JzZXJ2ZXIgcmVnaXN0cnkgaWYgaXQgaXNuJ3RcbiAqIGFscmVhZHkgcHJlc2VudC5cbiAqIEBwcml2YXRlXG4gKi9cbkludGVyc2VjdGlvbk9ic2VydmVyLnByb3RvdHlwZS5fcmVnaXN0ZXJJbnN0YW5jZSA9IGZ1bmN0aW9uKCkge1xuICBpZiAocmVnaXN0cnkuaW5kZXhPZih0aGlzKSA8IDApIHtcbiAgICByZWdpc3RyeS5wdXNoKHRoaXMpO1xuICB9XG59O1xuXG5cbi8qKlxuICogUmVtb3ZlcyB0aGUgaW5zdGFuY2UgZnJvbSB0aGUgZ2xvYmFsIEludGVyc2VjdGlvbk9ic2VydmVyIHJlZ2lzdHJ5LlxuICogQHByaXZhdGVcbiAqL1xuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIucHJvdG90eXBlLl91bnJlZ2lzdGVySW5zdGFuY2UgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGluZGV4ID0gcmVnaXN0cnkuaW5kZXhPZih0aGlzKTtcbiAgaWYgKGluZGV4ICE9IC0xKSByZWdpc3RyeS5zcGxpY2UoaW5kZXgsIDEpO1xufTtcblxuXG4vKipcbiAqIFJldHVybnMgdGhlIHJlc3VsdCBvZiB0aGUgcGVyZm9ybWFuY2Uubm93KCkgbWV0aG9kIG9yIG51bGwgaW4gYnJvd3NlcnNcbiAqIHRoYXQgZG9uJ3Qgc3VwcG9ydCB0aGUgQVBJLlxuICogQHJldHVybiB7bnVtYmVyfSBUaGUgZWxhcHNlZCB0aW1lIHNpbmNlIHRoZSBwYWdlIHdhcyByZXF1ZXN0ZWQuXG4gKi9cbmZ1bmN0aW9uIG5vdygpIHtcbiAgcmV0dXJuIHdpbmRvdy5wZXJmb3JtYW5jZSAmJiBwZXJmb3JtYW5jZS5ub3cgJiYgcGVyZm9ybWFuY2Uubm93KCk7XG59XG5cblxuLyoqXG4gKiBUaHJvdHRsZXMgYSBmdW5jdGlvbiBhbmQgZGVsYXlzIGl0cyBleGVjdXRpb25nLCBzbyBpdCdzIG9ubHkgY2FsbGVkIGF0IG1vc3RcbiAqIG9uY2Ugd2l0aGluIGEgZ2l2ZW4gdGltZSBwZXJpb2QuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmbiBUaGUgZnVuY3Rpb24gdG8gdGhyb3R0bGUuXG4gKiBAcGFyYW0ge251bWJlcn0gdGltZW91dCBUaGUgYW1vdW50IG9mIHRpbWUgdGhhdCBtdXN0IHBhc3MgYmVmb3JlIHRoZVxuICogICAgIGZ1bmN0aW9uIGNhbiBiZSBjYWxsZWQgYWdhaW4uXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn0gVGhlIHRocm90dGxlZCBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gdGhyb3R0bGUoZm4sIHRpbWVvdXQpIHtcbiAgdmFyIHRpbWVyID0gbnVsbDtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoIXRpbWVyKSB7XG4gICAgICB0aW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIGZuKCk7XG4gICAgICAgIHRpbWVyID0gbnVsbDtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH1cbiAgfTtcbn1cblxuXG4vKipcbiAqIEFkZHMgYW4gZXZlbnQgaGFuZGxlciB0byBhIERPTSBub2RlIGVuc3VyaW5nIGNyb3NzLWJyb3dzZXIgY29tcGF0aWJpbGl0eS5cbiAqIEBwYXJhbSB7Tm9kZX0gbm9kZSBUaGUgRE9NIG5vZGUgdG8gYWRkIHRoZSBldmVudCBoYW5kbGVyIHRvLlxuICogQHBhcmFtIHtzdHJpbmd9IGV2ZW50IFRoZSBldmVudCBuYW1lLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gVGhlIGV2ZW50IGhhbmRsZXIgdG8gYWRkLlxuICogQHBhcmFtIHtib29sZWFufSBvcHRfdXNlQ2FwdHVyZSBPcHRpb25hbGx5IGFkZHMgdGhlIGV2ZW4gdG8gdGhlIGNhcHR1cmVcbiAqICAgICBwaGFzZS4gTm90ZTogdGhpcyBvbmx5IHdvcmtzIGluIG1vZGVybiBicm93c2Vycy5cbiAqL1xuZnVuY3Rpb24gYWRkRXZlbnQobm9kZSwgZXZlbnQsIGZuLCBvcHRfdXNlQ2FwdHVyZSkge1xuICBpZiAodHlwZW9mIG5vZGUuYWRkRXZlbnRMaXN0ZW5lciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgbm9kZS5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBmbiwgb3B0X3VzZUNhcHR1cmUgfHwgZmFsc2UpO1xuICB9XG4gIGVsc2UgaWYgKHR5cGVvZiBub2RlLmF0dGFjaEV2ZW50ID09ICdmdW5jdGlvbicpIHtcbiAgICBub2RlLmF0dGFjaEV2ZW50KCdvbicgKyBldmVudCwgZm4pO1xuICB9XG59XG5cblxuLyoqXG4gKiBSZW1vdmVzIGEgcHJldmlvdXNseSBhZGRlZCBldmVudCBoYW5kbGVyIGZyb20gYSBET00gbm9kZS5cbiAqIEBwYXJhbSB7Tm9kZX0gbm9kZSBUaGUgRE9NIG5vZGUgdG8gcmVtb3ZlIHRoZSBldmVudCBoYW5kbGVyIGZyb20uXG4gKiBAcGFyYW0ge3N0cmluZ30gZXZlbnQgVGhlIGV2ZW50IG5hbWUuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmbiBUaGUgZXZlbnQgaGFuZGxlciB0byByZW1vdmUuXG4gKiBAcGFyYW0ge2Jvb2xlYW59IG9wdF91c2VDYXB0dXJlIElmIHRoZSBldmVudCBoYW5kbGVyIHdhcyBhZGRlZCB3aXRoIHRoaXNcbiAqICAgICBmbGFnIHNldCB0byB0cnVlLCBpdCBzaG91bGQgYmUgc2V0IHRvIHRydWUgaGVyZSBpbiBvcmRlciB0byByZW1vdmUgaXQuXG4gKi9cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50KG5vZGUsIGV2ZW50LCBmbiwgb3B0X3VzZUNhcHR1cmUpIHtcbiAgaWYgKHR5cGVvZiBub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIgPT0gJ2Z1bmN0aW9uJykge1xuICAgIG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgZm4sIG9wdF91c2VDYXB0dXJlIHx8IGZhbHNlKTtcbiAgfVxuICBlbHNlIGlmICh0eXBlb2Ygbm9kZS5kZXRhdGNoRXZlbnQgPT0gJ2Z1bmN0aW9uJykge1xuICAgIG5vZGUuZGV0YXRjaEV2ZW50KCdvbicgKyBldmVudCwgZm4pO1xuICB9XG59XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBpbnRlcnNlY3Rpb24gYmV0d2VlbiB0d28gcmVjdCBvYmplY3RzLlxuICogQHBhcmFtIHtPYmplY3R9IHJlY3QxIFRoZSBmaXJzdCByZWN0LlxuICogQHBhcmFtIHtPYmplY3R9IHJlY3QyIFRoZSBzZWNvbmQgcmVjdC5cbiAqIEByZXR1cm4gez9PYmplY3R9IFRoZSBpbnRlcnNlY3Rpb24gcmVjdCBvciB1bmRlZmluZWQgaWYgbm8gaW50ZXJzZWN0aW9uXG4gKiAgICAgaXMgZm91bmQuXG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVSZWN0SW50ZXJzZWN0aW9uKHJlY3QxLCByZWN0Mikge1xuICB2YXIgdG9wID0gTWF0aC5tYXgocmVjdDEudG9wLCByZWN0Mi50b3ApO1xuICB2YXIgYm90dG9tID0gTWF0aC5taW4ocmVjdDEuYm90dG9tLCByZWN0Mi5ib3R0b20pO1xuICB2YXIgbGVmdCA9IE1hdGgubWF4KHJlY3QxLmxlZnQsIHJlY3QyLmxlZnQpO1xuICB2YXIgcmlnaHQgPSBNYXRoLm1pbihyZWN0MS5yaWdodCwgcmVjdDIucmlnaHQpO1xuICB2YXIgd2lkdGggPSByaWdodCAtIGxlZnQ7XG4gIHZhciBoZWlnaHQgPSBib3R0b20gLSB0b3A7XG5cbiAgcmV0dXJuICh3aWR0aCA+PSAwICYmIGhlaWdodCA+PSAwKSAmJiB7XG4gICAgdG9wOiB0b3AsXG4gICAgYm90dG9tOiBib3R0b20sXG4gICAgbGVmdDogbGVmdCxcbiAgICByaWdodDogcmlnaHQsXG4gICAgd2lkdGg6IHdpZHRoLFxuICAgIGhlaWdodDogaGVpZ2h0XG4gIH07XG59XG5cblxuLyoqXG4gKiBTaGltcyB0aGUgbmF0aXZlIGdldEJvdW5kaW5nQ2xpZW50UmVjdCBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIG9sZGVyIElFLlxuICogQHBhcmFtIHtFbGVtZW50fSBlbCBUaGUgZWxlbWVudCB3aG9zZSBib3VuZGluZyByZWN0IHRvIGdldC5cbiAqIEByZXR1cm4ge09iamVjdH0gVGhlIChwb3NzaWJseSBzaGltbWVkKSByZWN0IG9mIHRoZSBlbGVtZW50LlxuICovXG5mdW5jdGlvbiBnZXRCb3VuZGluZ0NsaWVudFJlY3QoZWwpIHtcbiAgdmFyIHJlY3Q7XG5cbiAgdHJ5IHtcbiAgICByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIElnbm9yZSBXaW5kb3dzIDcgSUUxMSBcIlVuc3BlY2lmaWVkIGVycm9yXCJcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vdzNjL0ludGVyc2VjdGlvbk9ic2VydmVyL3B1bGwvMjA1XG4gIH1cblxuICBpZiAoIXJlY3QpIHJldHVybiBnZXRFbXB0eVJlY3QoKTtcblxuICAvLyBPbGRlciBJRVxuICBpZiAoIShyZWN0LndpZHRoICYmIHJlY3QuaGVpZ2h0KSkge1xuICAgIHJlY3QgPSB7XG4gICAgICB0b3A6IHJlY3QudG9wLFxuICAgICAgcmlnaHQ6IHJlY3QucmlnaHQsXG4gICAgICBib3R0b206IHJlY3QuYm90dG9tLFxuICAgICAgbGVmdDogcmVjdC5sZWZ0LFxuICAgICAgd2lkdGg6IHJlY3QucmlnaHQgLSByZWN0LmxlZnQsXG4gICAgICBoZWlnaHQ6IHJlY3QuYm90dG9tIC0gcmVjdC50b3BcbiAgICB9O1xuICB9XG4gIHJldHVybiByZWN0O1xufVxuXG5cbi8qKlxuICogUmV0dXJucyBhbiBlbXB0eSByZWN0IG9iamVjdC4gQW4gZW1wdHkgcmVjdCBpcyByZXR1cm5lZCB3aGVuIGFuIGVsZW1lbnRcbiAqIGlzIG5vdCBpbiB0aGUgRE9NLlxuICogQHJldHVybiB7T2JqZWN0fSBUaGUgZW1wdHkgcmVjdC5cbiAqL1xuZnVuY3Rpb24gZ2V0RW1wdHlSZWN0KCkge1xuICByZXR1cm4ge1xuICAgIHRvcDogMCxcbiAgICBib3R0b206IDAsXG4gICAgbGVmdDogMCxcbiAgICByaWdodDogMCxcbiAgICB3aWR0aDogMCxcbiAgICBoZWlnaHQ6IDBcbiAgfTtcbn1cblxuLyoqXG4gKiBDaGVja3MgdG8gc2VlIGlmIGEgcGFyZW50IGVsZW1lbnQgY29udGFpbnMgYSBjaGlsZCBlbGVtbnQgKGluY2x1ZGluZyBpbnNpZGVcbiAqIHNoYWRvdyBET00pLlxuICogQHBhcmFtIHtOb2RlfSBwYXJlbnQgVGhlIHBhcmVudCBlbGVtZW50LlxuICogQHBhcmFtIHtOb2RlfSBjaGlsZCBUaGUgY2hpbGQgZWxlbWVudC5cbiAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIHBhcmVudCBub2RlIGNvbnRhaW5zIHRoZSBjaGlsZCBub2RlLlxuICovXG5mdW5jdGlvbiBjb250YWluc0RlZXAocGFyZW50LCBjaGlsZCkge1xuICB2YXIgbm9kZSA9IGNoaWxkO1xuICB3aGlsZSAobm9kZSkge1xuICAgIGlmIChub2RlID09IHBhcmVudCkgcmV0dXJuIHRydWU7XG5cbiAgICBub2RlID0gZ2V0UGFyZW50Tm9kZShub2RlKTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cblxuLyoqXG4gKiBHZXRzIHRoZSBwYXJlbnQgbm9kZSBvZiBhbiBlbGVtZW50IG9yIGl0cyBob3N0IGVsZW1lbnQgaWYgdGhlIHBhcmVudCBub2RlXG4gKiBpcyBhIHNoYWRvdyByb290LlxuICogQHBhcmFtIHtOb2RlfSBub2RlIFRoZSBub2RlIHdob3NlIHBhcmVudCB0byBnZXQuXG4gKiBAcmV0dXJuIHtOb2RlfG51bGx9IFRoZSBwYXJlbnQgbm9kZSBvciBudWxsIGlmIG5vIHBhcmVudCBleGlzdHMuXG4gKi9cbmZ1bmN0aW9uIGdldFBhcmVudE5vZGUobm9kZSkge1xuICB2YXIgcGFyZW50ID0gbm9kZS5wYXJlbnROb2RlO1xuXG4gIGlmIChwYXJlbnQgJiYgcGFyZW50Lm5vZGVUeXBlID09IDExICYmIHBhcmVudC5ob3N0KSB7XG4gICAgLy8gSWYgdGhlIHBhcmVudCBpcyBhIHNoYWRvdyByb290LCByZXR1cm4gdGhlIGhvc3QgZWxlbWVudC5cbiAgICByZXR1cm4gcGFyZW50Lmhvc3Q7XG4gIH1cbiAgcmV0dXJuIHBhcmVudDtcbn1cblxuXG4vLyBFeHBvc2VzIHRoZSBjb25zdHJ1Y3RvcnMgZ2xvYmFsbHkuXG53aW5kb3cuSW50ZXJzZWN0aW9uT2JzZXJ2ZXIgPSBJbnRlcnNlY3Rpb25PYnNlcnZlcjtcbndpbmRvdy5JbnRlcnNlY3Rpb25PYnNlcnZlckVudHJ5ID0gSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeTtcblxufSh3aW5kb3csIGRvY3VtZW50KSk7XG4iLCIoZnVuY3Rpb24oJCkge1xuICAgIC8vIFNlbGVjdG9yIGZvciBvZmYtc2l0ZSBsaW5rc1xuICAgIC8vIFVzYWdlOiAkKFwiI2NvbnRlbnQgYTpleHRlcm5hbFwiKS4uLlxuICAgICQuZXhwci5wc2V1ZG9zLmV4dGVybmFsTGluayA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgICByZXR1cm4gKG9iai5ocmVmICE9PSBcIlwiICYmIG9iai5ob3N0bmFtZSAhPSBsb2NhdGlvbi5ob3N0bmFtZSkgJiYgKG9iai5wcm90b2NvbCA9PSAnaHR0cDonIHx8IG9iai5wcm90b2NvbCA9PSAnaHR0cHM6Jyk7XG4gICAgfTtcblxuICAgIC8vIFNlbGVjdG9yIGZvciBvbi1zaXRlIGxpbmtzXG4gICAgLy8gVXNhZ2U6ICQoXCIjY29udGVudCBhOmludGVybmFsXCIpLi4uXG4gICAgJC5leHByLnBzZXVkb3MuaW50ZXJuYWxMaW5rID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHJldHVybiBvYmouaG9zdG5hbWUgPT0gbG9jYXRpb24uaG9zdG5hbWUgJiYgKG9iai5wcm90b2NvbCA9PSAnaHR0cDonIHx8IG9iai5wcm90b2NvbCA9PSAnaHR0cHM6Jyk7XG4gICAgfTtcblxuICAgIC8vIFNlbGVjdG9yIGZvciBlbWFpbCBhZGRyZXNzZXNcbiAgICAvLyBVc2FnZTogJChcIiNjb250ZW50IGE6ZW1haWxcIikuLi5cbiAgICAkLmV4cHIucHNldWRvcy5lbWFpbExpbmsgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgICAgcmV0dXJuIG9iai5wcm90b2NvbCA9PT0gXCJtYWlsdG86XCI7XG4gICAgfTtcblxuICAgIC8vIFNlbGVjdG9yIGZvciBlbWFpbCBhZGRyZXNzZXNcbiAgICAvLyBVc2FnZTogJChcIiNjb250ZW50IGE6dGVsZXBob25lXCIpLi4uXG4gICAgJC5leHByLnBzZXVkb3MudGVsZXBob25lTGluayA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgICByZXR1cm4gb2JqLnByb3RvY29sID09PSBcInRlbDpcIjtcbiAgICB9O1xuXG4gICAgLy8gU2VsZWN0b3IgZm9yIG9mZi1zaXRlIGxpbmtzXG4gICAgLy8gVXNhZ2U6ICQoXCIjY29udGVudCBhOmV4dGVybmFsXCIpLi4uXG4gICAgJC5leHByLnBzZXVkb3MuaW1hZ2VMaW5rID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHJldHVybiAkKHRoaXMpLmF0dHIoJ2hyZWYnKS5tYXRjaCgvXFwuKGpwZ3xqcGVnfHBuZ3xzdmd8Z2lmfHdlYnB8dGlmezEsMn18YWl8KS9pKTtcbiAgICB9O1xufSggalF1ZXJ5ICkpOyIsIndpbmRvdy5saWJ1dGlscyA9IHt9O1xuXG4vLyB1dGlsaXR5IGZ1Y250aW9uIHRvIGNyZWF0ZSBmdW5jdGlvbiB3aXRoIHRpbWVvdXQsIHVzZWQgaW4gZ2EgZXZlbnRzXG5saWJ1dGlscy5hY3RXaXRoVGltZU91dCA9IGZ1bmN0aW9uKGNhbGxiYWNrLCBvcHRfdGltZW91dCkge1xuICBsZXQgY2FsbGVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGZuKCkge1xuICAgIGlmICghY2FsbGVkKSB7XG4gICAgICBjYWxsZWQgPSB0cnVlO1xuICAgICAgY2FsbGJhY2soKTtcbiAgICB9XG4gIH1cbiAgc2V0VGltZW91dChmbiwgb3B0X3RpbWVvdXQgfHwgMTAwMCk7XG4gIHJldHVybiBmbjtcbn07XG5cblxuLy8gZm9yIGdhIGV2ZW50cyB3aGVyZSB3ZSB3YW50IHRvIGdvIGRpcmVjdGx5IHRvIGEgdHlwYWhlYWRzIHVybCBlbGVtZW50XG5saWJ1dGlscy5nb1RvVXJsID0gZnVuY3Rpb24oZGF0dW0pIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IGRhdHVtLnVybDtcbn07XG5cbi8vIGZvciBnYSBldmVudHMgd2hlcmUgd2Ugd2FudCB0byBtZXNzYWdlIGEgdXJsIGJ5IGNvbmNhdGVuYXRpbmcgYSBzdHJpbmcgYW5kIElELlxubGlidXRpbHMuZ29Ub1N1YmplY3RVcmwgPSBmdW5jdGlvbihkYXR1bSwgcGF0aCkge1xuICAgIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gcGF0aCArIGRhdHVtLmlkO1xufTtcblxuLy8gY29udmVuaWVuY2Ugc3RvcmFnZSBmb3IgcmV1c2FibGUgY2FsbHMgdG8gc3ByaW5zaGFyZSBBUEkgdXJscy5cbmxpYnV0aWxzLnNwcmluc2hhcmVVcmxzID0ge1xuICBcInN1YmplY3RfZXhwZXJ0c1wiOiBcImh0dHBzOi8vbGdhcGktdXMubGliYXBwcy5jb20vMS4xL2FjY291bnRzLz9zaXRlX2lkPTcwMiZrZXk9OWEwMzIwNjk1ZTAwNzUxM2UzZjU2ZDZmNWY5ZTIxNTkmZXhwYW5kPXN1YmplY3RzXCIsXG4gIFwiZGF0YWJhc2VzXCI6IFwiaHR0cHM6Ly9sZ2FwaS11cy5saWJhcHBzLmNvbS8xLjEvYXNzZXRzP3NpdGVfaWQ9NzAyJmtleT05YTAzMjA2OTVlMDA3NTEzZTNmNTZkNmY1ZjllMjE1OSZhc3NldF90eXBlcz0xMCZleHBhbmQ9YXpfcHJvcHMsc3ViamVjdHNcIixcbiAgXCJndWlkZXNfZXhwYW5kX293bmVyX3N1YmplY3RcIjogXCJodHRwczovL2xnYXBpLXVzLmxpYmFwcHMuY29tLzEuMS9ndWlkZXMvP3NpdGVfaWQ9NzAyJmtleT05YTAzMjA2OTVlMDA3NTEzZTNmNTZkNmY1ZjllMjE1OSZzdGF0dXNbXT0xJnNvcnRfYnk9bmFtZSZleHBhbmQ9b3duZXIsc3ViamVjdHNcIixcbiAgXCJzdWJqZWN0c19saXN0XCI6IFwiaHR0cHM6Ly9sZ2FwaS11cy5saWJhcHBzLmNvbS8xLjEvc3ViamVjdHM/c2l0ZV9pZD03MDIma2V5PTlhMDMyMDY5NWUwMDc1MTNlM2Y1NmQ2ZjVmOWUyMTU5XCIsXG4gIFwiYW5zd2VyX2ZhcXNcIjogXCJodHRwczovL2FwaTIubGliYW5zd2Vycy5jb20vMS4wL3NlYXJjaC8lUVVFUlk/aWlkPTE3NTgmY2FsbGJhY2s9ZmFxc1wiXG59O1xuXG4vLyBzZXQgdGhlIGNvcnJlY3QgYWJzb2x1dGUgcGF0aCBkdXJpbmcgZGV2ZWxvcG1lbnRcbmlmIChsb2NhdGlvbi5ob3N0bmFtZSA9PT0gXCJsb2NhbGhvc3RcIiB8fCBsb2NhdGlvbi5ob3N0bmFtZSA9PT0gXCIxMjcuMC4wLjFcIil7XG4gICAgbGlidXRpbHMuc2l0ZURvbWFpbiA9IFwiXCI7XG59IGVsc2Uge1xuICAgIGxpYnV0aWxzLnNpdGVEb21haW4gPSBcImh0dHBzOi8vbGlicmFyeS51bnQuZWR1XCI7XG59XG5cbiQoZG9jdW1lbnQpLnJlYWR5KGZ1bmN0aW9uKCl7XG5cbiAgICAvLyBFbmFibGUgdG9vbHRpcHNcbiAgICAkKFwiW2RhdGEtdG9nZ2xlPVxcXCJ0b29sdGlwXFxcIl1cIikudG9vbHRpcCh7XG4gICAgICAgIGNvbnRhaW5lcjogXCJib2R5XCJcbiAgICB9KTtcbiAgICAvLyBlbmFibGUgcG9wb3ZlcnNcbiAgICAkKFwiW2RhdGEtdG9nZ2xlPVxcXCJwb3BvdmVyXFxcIl1cIikucG9wb3Zlcih7XG4gICAgICAgIGNvbnRhaW5lcjogXCJib2R5XCJcbiAgICB9KTtcblxuXG4gICAgLy8gc2V0IGEgbnVtYmVyIG9mIHJldXNhYmxlIERPTSB2YXJpYWJsZXNcbiAgICBsZXQgJGJvZHkgPSAkKFwiYm9keVwiKSxcbiAgICAgICAgJGhlYWQgPSAkKFwiI2hlYWRcIiksXG4gICAgICAgICRzY3JvbGxlZEhlYWQgPSAkKFwiI3Njcm9sbGVkLWhlYWRlclwiKSxcbiAgICAgICAgJHRvVG9wID0gJChcIiN0by10b3BcIiksXG4gICAgICAgICRiYW5uZXJJbWcgPSAkKFwiI3VudC1iYW5uZXItaW1nXCIpLFxuICAgICAgICAkYmFubmVyTGV0dGVyTWFyayA9ICQoXCIjdW50LWJhbm5lci1sZXR0ZXJtYXJrXCIpO1xuXG4gICAgLy8gU2V0IHNjcm9sbGluZyBoZWFkZXIgdWkgYnkgb2JzZXJ2aW5nIG1haW4gbmF2IHJlbGF0aXZlIHRvIHZpZXdwb3J0XG4gICAgbGV0IHNjcm9sbGVkTmF2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNwcmltYXJ5LW5hdmlnYXRpb25cIiksXG4gICAgICAgIHNjcm9sbGVkTmF2T2JzZXJ2ZXIgPSBuZXcgSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24gKGVudHJpZXMsIG9ic2VydmVyKSB7XG4gICAgICAgIGlmIChlbnRyaWVzWzBdLmlzSW50ZXJzZWN0aW5nKSB7XG4gICAgICAgICAgICAkaGVhZC5yZW1vdmVDbGFzcyhcInNjcm9sbGVkXCIpO1xuICAgICAgICAgICAgJGJhbm5lckltZy5yZW1vdmVDbGFzcyhcImQtbm9uZVwiKTtcbiAgICAgICAgICAgICRiYW5uZXJMZXR0ZXJNYXJrLmFkZENsYXNzKFwiZC1ub25lXCIpO1xuICAgICAgICAgICAgJHRvVG9wLmZhZGVPdXQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICRoZWFkLmFkZENsYXNzKFwic2Nyb2xsZWRcIik7XG4gICAgICAgICAgICAkYmFubmVySW1nLmFkZENsYXNzKFwiZC1ub25lXCIpO1xuICAgICAgICAgICAgJGJhbm5lckxldHRlck1hcmsucmVtb3ZlQ2xhc3MoXCJkLW5vbmVcIik7XG4gICAgICAgICAgICAkdG9Ub3AuZmFkZUluKCk7XG4gICAgICAgIH1cbiAgICB9LCB7XG4gICAgICAgIHRocmVzaG9sZDogWzAsIDFdXG4gICAgfSk7XG4gICAgLy8gZG8gdGhlIG9ic2VydmluZ1xuICAgIHNjcm9sbGVkTmF2T2JzZXJ2ZXIub2JzZXJ2ZSggc2Nyb2xsZWROYXYgKTtcblxuICAgIC8vIG9ubHkgcmVsZXZhbnQgdG8gaG9tZXBhZ2VcbiAgICBpZiAoICQoXCJib2R5LmhvbWVcIikubGVuZ3RoICkge1xuICAgICAgLy8gcHJlcCBzZWFyY2ggdGFicyBvbiBob21lcGFnZVxuICAgICAgbGV0ICRwaWxsVGFicyA9ICQoXCIjdi1waWxscy10YWJcIiksXG4gICAgICAgICAgJHBpbnMgPSAkcGlsbFRhYnMuZmluZChcInNwYW4uYmFkZ2VcIiksXG4gICAgICAgICAgJHRhYkFsZXJ0ID0gJChcIiN0YWItY29va2llLW5vZml0aWNhdGlvblwiKTtcblxuICAgICAgLy8gcHJldmVudCBoYXNoZXMgaW4gdXJsIGJhci4gc2hvdy9oaWRlIHBpbnMgZm9yIGNvb2tpZSBzdGF0ZSBzYXZpbmdcbiAgICAgICRwaWxsVGFicy5maW5kKFwiYVwiKS5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKGUpe1xuICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICBsZXQgJHRoaXMgPSAkKHRoaXMpO1xuICAgICAgICAgICR0aGlzLnRhYihcInNob3dcIik7XG4gICAgICAgICAgJHBpbnMuaGlkZSgpO1xuICAgICAgICAgICR0aGlzLmZpbmQoXCJzcGFuLmJhZGdlXCIpLnNob3coKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBkbyB0b29sdGlwcyBmb3IgcGluc1xuICAgICAgJHBpbnMudG9vbHRpcCh7XG4gICAgICAgICAgY29udGFpbmVyOiBcImJvZHlcIixcbiAgICAgICAgICBwbGFjZW1lbnQ6IFwidG9wXCIsXG4gICAgICAgICAgdGl0bGU6IFwiTWFrZSB0aGlzIHlvdXIgZGVmYXVsdCBzZWFyY2hcIlxuICAgICAgfSk7XG5cbiAgICAgIC8vIG9uIHBpbiBjbGljayBzZXQgY29va2llIGFuZCBzaG93IG5vdGlmaWNhdGlvblxuICAgICAgJHBpbnMub24oXCJjbGlja1wiLCBmdW5jdGlvbigpe1xuICAgICAgICAgIGxldCAkdGhpcyA9ICQodGhpcyksXG4gICAgICAgICAgICAgIHdoaWNoID0gJCh0aGlzKS5kYXRhKFwidmFsdWVcIik7XG5cbiAgICAgICAgICAkdGFiQWxlcnQuc2hvdygpO1xuICAgICAgICAgICRwaW5zLnJlbW92ZUNsYXNzKFwidGV4dC13aGl0ZVwiKTtcbiAgICAgICAgICAkKHRoaXMpLmFkZENsYXNzKFwidGV4dC13aGl0ZVwiKTtcblxuICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwidW50bGlicmFyeXNlYXJjaHRhYlwiLCB3aGljaCk7XG5cbiAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgJHRhYkFsZXJ0LmZhZGVUbyg1MDAsIDApLnNsaWRlVXAoNTAwLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgJCh0aGlzKS5jc3MoIFwib3BhY2l0eVwiLCAxICk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0sIDUwMDApO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIHRlc3QgbG9jYWxzdG9yYWdlIGZvciBwaW5uZWQgdGFiLCBpZiBub3QsIGFjdGl2YXRlIDFzdCBvbmUuXG4gICAgICBpZiAoIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwidW50bGlicmFyeXNlYXJjaHRhYlwiKSApIHtcbiAgICAgICAgICBsZXQgc2F2ZWRUYWIgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcInVudGxpYnJhcnlzZWFyY2h0YWJcIik7XG5cbiAgICAgICAgICAkcGlsbFRhYnMuZmluZChcIltkYXRhLXZhbHVlPVwiICsgc2F2ZWRUYWIgKyBcIl1cIilcbiAgICAgICAgICAgICAgLmNsb3Nlc3QoXCJhXCIpXG4gICAgICAgICAgICAgIC50YWIoXCJzaG93XCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAkcGlsbFRhYnMuZmluZChcImFcIikuZmlyc3QoKS50YWIoXCJzaG93XCIpO1xuICAgICAgfVxuXG4gICAgICAvLyB1c2VyIGNsaWNrZWQgYSBob21lcGFnZSB0YWIsIGZvY3VzIG9uIHRoZSBtYWluIHNlYXJjaCBib3guXG4gICAgICAkKFwiI3YtcGlsbHMtdGFiIGFcIikub24oXCJzaG93bi5icy50YWJcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAkKFwiI3YtcGlsbHMtdGFiQ29udGVudCAuYWN0aXZlXCIpLmZpbmQoXCJpbnB1dFt0eXBlPVxcXCJ0ZXh0XFxcIl06Zmlyc3RcIikuZm9jdXMoKTtcbiAgICAgIH0pO1xuXG5cbiAgICAgIGxldCBzYXZlZERpc2NpcGxpbmUsXG4gICAgICAgICAgc2F2ZWRTZWFyY2hUeXBlLFxuICAgICAgICAgIHNhdmVkU2VhcmNoU2NvcGUsXG4gICAgICAgICAgJHN1bW1vbkRpc2NpcGxpbmVTZWxlY3QgPSAgJChcIiNzdW1tb24tZGlzY2lwbGluZVwiKSxcbiAgICAgICAgICAkc3VtbW9uUGFyZW50Rm9ybSA9ICQoXCIjc2VhcmNoLWFydGljbGVzLWZvcm1cIiksXG4gICAgICAgICAgJHNlYXJjaHR5cGVTZWxlY3QgPSAkKFwiI3Bhc3NUaGlzU2VhcmNodHlwZVwiKSxcbiAgICAgICAgICAkc2VhcmNoU2NvcGVTZWxlY3QgPSAkKFwiI3NlYXJjaHNjb3BlXCIpLFxuICAgICAgICAgICRjYXRhbG9nVHlwZVNlbGVjdFBhcmVudEZvcm0gPSAkKFwiI3NlYXJjaC1jYXRhbG9nLWZvcm1cIiksXG4gICAgICAgICAgJGludmVydEF1dGhvckJ0biA9ICQoXCIjaW52ZXJ0LWF1dGhvclwiKSxcbiAgICAgICAgICAkc2VhcmNoYXJnID0gJChcIiNzZWFyY2hhcmdcIik7XG5cblxuICAgICAgLy8gZ2V0IGFuZCBzZXQgc3VtbW9uIGRpc2NpcGxpbmUgaWYgc2V0IGluIGxvY2FsU3RvcmFnZVxuICAgICAgaWYgKCBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcInN1bW1vbmRpc2NpcGxpbmVcIikgKXtcbiAgICAgICAgICBzYXZlZERpc2NpcGxpbmUgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcInN1bW1vbmRpc2NpcGxpbmVcIik7XG4gICAgICAgICAgJHN1bW1vbkRpc2NpcGxpbmVTZWxlY3QudmFsKHNhdmVkRGlzY2lwbGluZSk7XG4gICAgICAgICAgJHN1bW1vblBhcmVudEZvcm0uZGF0YShcImdhLWxhYmVsXCIsIHNhdmVkRGlzY2lwbGluZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFJlbWVtYmVyIGNoYW5nZXMgdG8gc3VtbW9uIGRpc2NpcGxpbmUgZHJvcGRvd24uXG4gICAgICAkc3VtbW9uRGlzY2lwbGluZVNlbGVjdC5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpe1xuICAgICAgICAgIGxldCAkdGhpcyA9ICQodGhpcyksXG4gICAgICAgICAgICAgIHZhbCA9ICR0aGlzLnZhbCgpIHx8IFwiQW55IERpc2NpcGxpbmVcIjtcbiAgICAgICAgICAkc3VtbW9uUGFyZW50Rm9ybS5kYXRhKFwiZ2EtbGFiZWxcIiwgdmFsKTtcbiAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInN1bW1vbmRpc2NpcGxpbmVcIiwgdmFsKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBkb24ndCBwYXNzIGZpZWxkIG5hbWVzIG9mIGVsZW1lbnRzIHdpdGggbm8gdmFsdWVcbiAgICAgICRzdW1tb25QYXJlbnRGb3JtLnN1Ym1pdChmdW5jdGlvbiAoZSkge1xuICAgICAgICBsZXQgJHN1bW1vbkRpc2NpcGxpbmUgPSAkKFwiI3N1bW1vbi1kaXNjaXBsaW5lXCIpLFxuICAgICAgICAgICAgZGlzY2lwbGluZVZhbCA9ICRzdW1tb25EaXNjaXBsaW5lLnZhbCgpO1xuICAgICAgICBpZiAoZGlzY2lwbGluZVZhbCA9PT0gdW5kZWZpbmVkIHx8IGRpc2NpcGxpbmVWYWwgPT09IFwiXCIgfHwgZGlzY2lwbGluZVZhbCA9PT0gXCJBbnkgRGlzY2lwbGluZVwiKSB7XG4gICAgICAgICAgJHN1bW1vbkRpc2NpcGxpbmUuYXR0cihcIm5hbWVcIiwgXCJcIik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG5cbiAgICAgIC8vIGdldCBhbmQgc2V0IGNhdGFsb2cgc2VhcmNoIHR5cGUgaWYgc2V0IGluIGxvY2FsU3RvcmFnZVxuICAgICAgaWYgKCBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcImNhdGFsb2dzZWFyY2h0eXBlXCIpICkge1xuICAgICAgICAgIHNhdmVkU2VhcmNoVHlwZSA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiY2F0YWxvZ3NlYXJjaHR5cGVcIik7XG4gICAgICAgICAgJHNlYXJjaHR5cGVTZWxlY3QudmFsKHNhdmVkU2VhcmNoVHlwZSk7XG4gICAgICAgICAgbGV0IHNjb3BlVmFsdWUgPSAkc2VhcmNoU2NvcGVTZWxlY3QudmFsKCk7XG5cbiAgICAgICAgICAkY2F0YWxvZ1R5cGVTZWxlY3RQYXJlbnRGb3JtLmRhdGEoXCJnYS1sYWJlbFwiLCBzYXZlZFNlYXJjaFR5cGUgKyBzY29wZVZhbHVlKTtcbiAgICAgICAgICBpZiAoc2F2ZWRTZWFyY2hUeXBlID09PSBcImFcIikge1xuICAgICAgICAgICAgJGludmVydEF1dGhvckJ0bi5zaG93KCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICRpbnZlcnRBdXRob3JCdG4uaGlkZSgpO1xuICAgICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gZ2V0IGFuZCBzZXQgY2F0YWxvZyBzZWFyY2ggc2NvcGUgaWYgc2V0IGluIGxvY2FsU3RvcmFnZVxuICAgICAgaWYgKCBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcImNhdGFsb2dzZWFyY2hzY29wZVwiKSApIHtcbiAgICAgICAgICBzYXZlZFNlYXJjaFNjb3BlID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJjYXRhbG9nc2VhcmNoc2NvcGVcIik7XG4gICAgICAgICAgJHNlYXJjaFNjb3BlU2VsZWN0LnZhbChzYXZlZFNlYXJjaFNjb3BlKTtcbiAgICAgICAgICBsZXQgdHlwZVZhbHVlID0gJHNlYXJjaHR5cGVTZWxlY3QudmFsKCk7XG4gICAgICAgICAgJGNhdGFsb2dUeXBlU2VsZWN0UGFyZW50Rm9ybS5kYXRhKFwiZ2EtbGFiZWxcIiwgdHlwZVZhbHVlICsgc2F2ZWRTZWFyY2hTY29wZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFJlbWVtYmVyIGNoYW5nZXMgdG8gY2F0YWxvZyBzZWFyY2ggdHlwZSBkcm9wZG93biAoa2V5d29yZHMvdGl0bGVzLCBldGMuKS5cbiAgICAgICRzZWFyY2h0eXBlU2VsZWN0Lm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgbGV0ICR0aGlzID0gJCh0aGlzKSxcbiAgICAgICAgICAgICAgdmFsID0gJHRoaXMudmFsKCk7XG4gICAgICAgICAgJGNhdGFsb2dUeXBlU2VsZWN0UGFyZW50Rm9ybS5kYXRhKFwiZ2EtbGFiZWxcIiwgdmFsICsgJHNlYXJjaFNjb3BlU2VsZWN0LnZhbCgpKTtcbiAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcImNhdGFsb2dzZWFyY2h0eXBlXCIsIHZhbCk7XG4gICAgICAgICAgaWYgKHZhbCA9PT0gXCJhXCIpIHtcbiAgICAgICAgICAgICRpbnZlcnRBdXRob3JCdG4uc2hvdygpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAkaW52ZXJ0QXV0aG9yQnRuLmhpZGUoKTtcbiAgICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gUmVtZW1iZXIgY2hhbmdlcyB0byBjYXRhbG9nIHNlYXJjaCB0eXBlIGRyb3Bkb3duIChrZXl3b3Jkcy90aXRsZXMsIGV0Yy4pLlxuICAgICAgJHNlYXJjaFNjb3BlU2VsZWN0Lm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgbGV0ICR0aGlzID0gJCh0aGlzKSxcbiAgICAgICAgICAgICAgdmFsID0gJHRoaXMudmFsKCk7XG4gICAgICAgICAgJGNhdGFsb2dUeXBlU2VsZWN0UGFyZW50Rm9ybS5kYXRhKFwiZ2EtbGFiZWxcIiwgJHNlYXJjaHR5cGVTZWxlY3QudmFsKCkgKyB2YWwpO1xuICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwiY2F0YWxvZ3NlYXJjaHNjb3BlXCIsIHZhbCk7XG4gICAgICB9KTtcblxuICAgICAgJGludmVydEF1dGhvckJ0bi5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgIGxldCBxdWVyeVRvQXJyYXkgPSAkc2VhcmNoYXJnLnZhbCgpLnRyaW0oKS5zcGxpdChcIiBcIiksXG4gICAgICAgICAgICBsYXN0TmFtZSA9IHF1ZXJ5VG9BcnJheS5wb3AoKSxcbiAgICAgICAgICAgIHRoZVJlc3QgPSBxdWVyeVRvQXJyYXkuam9pbihcIiBcIik7XG4gICAgICAgICAgICAgICRzZWFyY2hhcmcudmFsKGxhc3ROYW1lICsgXCIsIFwiICsgdGhlUmVzdCApO1xuICAgICAgfSk7XG5cbiAgICB9XG5cbiAgICAvLyBXaGVuIHVzZXIgY2xpY2tzIG9uIHRoZSBzZWFyY2ggaWNvbiBpbiBzaXRlIGhlYWRlciwgYXV0by1mb2N1cyB0aGUgYmVudG8gYm94IGlucHV0IGFmdGVyIGRyYXdlciBoYXMgb3BlbmVkLlxuICAgICQoXCIjc2VhcmNoLWRyYXdlclwiKS5vbihcInNob3duLmJzLm1vZGFsXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgJChcIiNkcmF3ZXItcVwiKS5mb2N1cygpO1xuICAgIH0pO1xuXG4gICAgLy8gcHJldHR5IHNjcm9sbCB0byB0b3Agb2YgdGhlIHNjcmVlbiBvbiBidXR0b24gcHVzaCxcbiAgICAkKFwiI3RvLXRvcFwiKS5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKGUpe1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICQoXCJib2R5LGh0bWxcIikuYW5pbWF0ZSh7XG4gICAgICAgICAgICBzY3JvbGxUb3A6IDBcbiAgICAgICAgfSwgODAwKTtcbiAgICAgICAgLy8gcmVtb3ZlIGhhc2hlcyBpbiB0aGUgVVJMLlxuICAgICAgICBoaXN0b3J5LnB1c2hTdGF0ZShcIlwiLCBkb2N1bWVudC50aXRsZSwgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICsgd2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gICAgfSk7XG5cblxuICAgIC8vIGhvbWVwYWdlIGZlYXR1cmUgY2Fyb3VzZWxcbiAgICAkKFwiI2ZlYXR1cmUtd3JhcHBlclwiKS5vbihcInNsaWRlLmJzLmNhcm91c2VsXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICQodGhpcykuZmluZChcIi5hY3RpdmUgYVwiKS5maXJzdCgpLmZvY3VzKCk7XG4gICAgfSk7XG5cblxuICAgIC8vIEFkZCBUYWJsZSBvZiBjb250ZW50cyBsaW5rcyB0byB0aGUgZHJvcGRvd24gYmVsb3cgdGhlIGJyZWFkY3J1bWJzLlxuICAgIC8vIFJldXNlIHByZXZpb3VzbHkgcmVuZGVyZWQgZnJvbSBhbmNob3IuanNcbiAgICBpZiAod2luZG93LmFuY2hvcnMgJiYgYW5jaG9ycy5lbGVtZW50cy5sZW5ndGgpIHtcbiAgICAgICAgbGV0ICR0b2MgPSAkKFwiI3BhZ2UtdG9jXCIpLFxuICAgICAgICAgICAgaXRlbXMgPSBcIlwiLFxuICAgICAgICAgICAgZWwsIHRpdGxlLCBsaW5rLCBhbmM7XG5cbiAgICAgICAgJChhbmNob3JzLmVsZW1lbnRzKS5lYWNoKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgbGV0IGVsID0gJCh0aGlzKSxcbiAgICAgICAgICAgICAgYW5jID0gZWwuZmluZChcIi5hbmNob3Jqcy1saW5rXCIpXG4gICAgICAgICAgICAgIHRpdGxlID0gZWwudGV4dCgpLFxuICAgICAgICAgICAgICBsaW5rID0gXCIjXCIgKyBlbC5hdHRyKFwiaWRcIiksXG4gICAgICAgICAgICAgIHRvY0xpbmsgPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyBsaW5rLFxuICAgICAgICAgICAgICAkaW5zZXJ0ZWQgPSBgPGxpIGNsYXNzPVwidG9jLWVudHJ5IHRvYy1oMlwiPjxhIGRhdGEtZ2EtY2F0ZWdvcnk9XCJsaW5rIC0gVE9DXCIgZGF0YS1nYS1hY3Rpb249XCJwYWdlXCIgZGF0YS1nYS1sYWJlbD1cIiR7dG9jTGlua31cIiBocmVmPVwiJHtsaW5rfVwiPiR7dGl0bGV9PC9hPjwvbGk+YDtcblxuICAgICAgICAgICAgICBpdGVtcyArPSAkaW5zZXJ0ZWQ7XG4gICAgICAgICAgICAgIGFuYy5hdHRyKFwiYXJpYS1sYWJlbFwiLCBcIkFuY2hvcjogXCIgKyB0aXRsZSk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKCR0b2MpLmFwcGVuZChpdGVtcyk7XG4gICAgfSBlbHNle1xuICAgICAgICAkKFwiI3BhZ2UtdG9jXCIpLmhpZGUoKTtcbiAgICB9XG5cbiAgICAvLyBvbGQgc2Nob29sIGp1bXAgbWVudXMgY2F1c2Ugc29tZXRpbWVzIHRoZXkgYXJlIHRoZSB0b29sIHRvIHVzZS5cbiAgICAkKFwiZm9ybS5qdW1wXCIpLm9uKFwic3VibWl0XCIsIGZ1bmN0aW9uKGUpe1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGxldCAkanVtcE1lbnUgPSAkKHRoaXMpLmZpbmQoXCJzZWxlY3RcIiksXG4gICAgICAgICAgICBzZWxlY3RlZFZhbHVlID0gJGp1bXBNZW51LmZpbmQoXCJvcHRpb246c2VsZWN0ZWRcIikudmFsKCk7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZXBsYWNlKCBzZWxlY3RlZFZhbHVlICk7XG4gICAgfSk7XG5cblxuXG4gICAgaWYgKCAkKFwiLmJ0bi5jbGlwYm9hcmQtdHJpZ2dlclwiKS5sZW5ndGggKSB7XG4gICAgICAgIG5ldyBDbGlwYm9hcmRKUyhcIi5idG4uY2xpcGJvYXJkLXRyaWdnZXJcIik7XG4gICAgfVxuXG4gICAgLy8gU2VhcmNoIEZvcm0gQW5hbHl0aWNzIFRyYWNraW5nXG4gICAgbGV0IHNlYXJjaEZvcm1zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChcImZvcm0uc2VhcmNoXCIpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpPHNlYXJjaEZvcm1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHNlYXJjaEZvcm1zW2ldLmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgICAgICBsZXQgJHRoaXMgPSAkKHRoaXMpLFxuICAgICAgICAgICAgICAgIGNhdGVnb3J5ID0gJHRoaXMuZGF0YShcImdhLWNhdGVnb3J5XCIpIHx8IFwiZm9ybSAtIHNlYXJjaCAtIHVudGFnZ2VkXCIsXG4gICAgICAgICAgICAgICAgYWN0aW9uID0gJHRoaXMuZmluZChcImlucHV0LnF1ZXJ5XCIpLnZhbCgpIHx8IFwiZW1wdHlcIixcbiAgICAgICAgICAgICAgICBsYWJlbCA9ICR0aGlzLmRhdGEoXCJnYS1sYWJlbFwiKSB8fCBkb2N1bWVudC5sb2NhdGlvbi5ocmVmLFxuICAgICAgICAgICAgICAgIHZhbHVlID0gXy5zaXplKF8ud29yZHMoYWN0aW9uKSkgfHwgMDtcblxuICAgICAgICAgICAgZnVuY3Rpb24gc3VibWl0Rm9ybSgpIHtcbiAgICAgICAgICAgICAgICAkdGhpcy5zdWJtaXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdhKFwic2VuZFwiLCBcImV2ZW50XCIsIGNhdGVnb3J5LCBhY3Rpb24sIGxhYmVsLCB2YWx1ZSwge2hpdENhbGxiYWNrOiBsaWJ1dGlscy5hY3RXaXRoVGltZU91dChmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIHN1Ym1pdEZvcm0oKTtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBET0kgc2VhcmNoIHV0aWxpdHkuICBJZiBET0kgZGV0ZWN0ZWQsIG9mZmVyIHBvcHVwIHdpdGggbGlua3MgZGlyZWN0bHkgdG8gb2JqZWN0IGFuZCB3ZWxsIGZvcm1lZCBzdW1tb24gc2VhcmNoLlxuICAgICQoXCJpbnB1dC5kb2ktdGFyZ2V0XCIpLm9uKFwiaW5wdXRcIiwgZnVuY3Rpb24oZSl7XG4gICAgICBpZiAoZS5vcmlnaW5hbEV2ZW50LmlucHV0VHlwZSA9PSAnaW5zZXJ0RnJvbVBhc3RlJykge1xuICAgICAgICBsZXQgJHRoaXMgPSAkKHRoaXMpLFxuICAgICAgICAgICAgJGljb24gPSAkdGhpcy5zaWJsaW5ncyhcIi5pbnB1dC1ncm91cC1hcHBlbmRcIikuZmluZChcIi5kb2ktaWNvblwiKSxcbiAgICAgICAgICAgICRkb2ltb2RhbCA9ICQoXCIjZG9pLW1vZGFsXCIpLFxuICAgICAgICAgICAgJGRvaU1vZGFsSW5wdXQgPSAkKFwiI2RvaS10ZXh0XCIpLFxuICAgICAgICAgICAgZG9pUmUgPSAvMTAuXFxkezQsOX1cXC9bLS5fOygpXFwvOkEtWjAtOV0rL2lnLFxuICAgICAgICAgICAgZG9pUGFzdGUgPSAkdGhpcy52YWwoKSxcbiAgICAgICAgICAgIGRvaSA9IGRvaVBhc3RlLm1hdGNoKGRvaVJlKTtcbiAgICAgICAgICAgIGlmIChkb2kpIHtcblxuICAgICAgICAgICAgICAkZG9pTW9kYWxJbnB1dC52YWwoZG9pKS50cmlnZ2VyKFwiY2hhbmdlXCIpO1xuXG4gICAgICAgICAgICAgICRpY29uLnJlbW92ZUNsYXNzKFwiZC1ub25lXCIpLnRvb2x0aXAoe1xuICAgICAgICAgICAgICAgIHBsYWNlbWVudDogJ3RvcCcsXG4gICAgICAgICAgICAgICAgdHJpZ2dlcjogJ21hbnVhbCdcbiAgICAgICAgICAgICAgfSkudG9vbHRpcChcInNob3dcIik7XG5cbiAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICRpY29uLmZvY3VzKCk7XG4gICAgICAgICAgICAgIH0sMTAwKTtcblxuICAgICAgICAgICAgICAkaWNvbi5vbignYmx1cicsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgICAkaWNvbi50b29sdGlwKCdoaWRlJyk7XG4gICAgICAgICAgICAgIH0pO1xuXG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICRpY29uLmFkZENsYXNzKFwiZC1ub25lXCIpLnRvb2x0aXAoXCJoaWRlXCIpO1xuICAgICAgICAgICAgICAkZG9pTW9kYWxJbnB1dC52YWwoXCJcIikudHJpZ2dlcihcImNoYW5nZVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgICQoXCIjZG9pLXRleHRcIikub24oXCJjaGFuZ2VcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgbGV0IGRvaVZhbCA9ICQodGhpcykudmFsKCk7XG4gICAgICAgICQoXCIjZG9pLWRvaW9yZ1wiKS5hdHRyKFwiaHJlZlwiLCBgaHR0cHM6Ly9saWJwcm94eS5saWJyYXJ5LnVudC5lZHUvbG9naW4/dXJsPWh0dHBzOi8vZG9pLm9yZy8ke2RvaVZhbH1gKTtcbiAgICAgICAgJChcIiNkb2ktb2Fkb2lvcmdcIikuYXR0cihcImhyZWZcIiwgYGh0dHBzOi8vb2Fkb2kub3JnLyR7ZG9pVmFsfWApO1xuICAgICAgICAkKFwiI2RvaS1zdW1tb25cIikuYXR0cihcImhyZWZcIiwgYGh0dHBzOi8vdW50ZXhhcy5zdW1tb24uc2VyaWFsc3NvbHV0aW9ucy5jb20vc2VhcmNoIyEvc2VhcmNoP2hvPWYmbD1lbiZxPShET0k6KCR7ZG9pVmFsfSkpYCk7XG4gICAgfSk7XG59KTsiXX0=
