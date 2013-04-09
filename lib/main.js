/*
 * Selfoss Notify Firefox Addon
 * by Ivan Strokanev <bahbka@gmail.com>
 */

// TODO add pocket button (and maybe social buttons?)
// TODO change collapse/raise entry behaviour

var self = require("sdk/self");
var _ = require("sdk/l10n").get;

var settings = require("sdk/simple-prefs").prefs;
var request = require("sdk/request").Request;
var timers = require("sdk/timers");

// addon-wide variables
var timer;
var currentBadgeText;
var currentItems = {};
var lastUpdated = null;
var cleanUrl = null;
var unreadItemsCount = 0;
var unreadItemsCountMore = 0;
var panelNumberItems = settings.numberItems;

var APIHandlers = {
    login: "/login",
    items: "/items",
    stats: "/stats",
    mark: "/mark",
    starr: "/starr",
    unstarr: "/unstarr",
};

/*
 * ELEMENTS 
 */
// widget
var widget = require("sdk/widget").Widget({
    id: "selfoss-notify",
    label: "selfoss",
    contentURL: self.data.url("widget.html"),
    contentScriptFile: self.data.url("widget.js"),
    onAttach: function () {
        console.log("INIT");
        updateInterval();
    }
});

// preview panel
var panel = require("sdk/panel").Panel({
    width: 600,
    height: 80,
    contentURL: self.data.url("panel.html"),
    contentScriptFile: [
        self.data.url("jquery-1.9.1.min.js"),
        self.data.url("panel.js")
    ],
    onShow: function() {
        panel.port.emit("panelResize");
    }
});

// notification
var popup = require("sdk/panel").Panel({
    width: 140,
    height: 50,
    contentURL: self.data.url("popup.html"),
    contentScriptFile: [
        self.data.url("jquery-1.9.1.min.js"),
        self.data.url("popup.js")
    ]
});

/*
 * CHANGE SETTING EVENTS
 */
require("sdk/simple-prefs").on("showBadge", function() { updateWidget(currentBadgeText); });
require("sdk/simple-prefs").on("fontSize", function() { updateWidget(currentBadgeText); });
require("sdk/simple-prefs").on("fontColor", function() { updateWidget(currentBadgeText); });
require("sdk/simple-prefs").on("bgColor", function() { updateWidget(currentBadgeText); });
require("sdk/simple-prefs").on("badgeOpacity", function() { updateWidget(currentBadgeText); });

require("sdk/simple-prefs").on("tryUpdate", mainProcess);
require("sdk/simple-prefs").on("interval", updateInterval);

require("sdk/simple-prefs").on("numberItems", function() {
    if (settings.numberItems < 1) settings.numberItems = 1;
    if (settings.numberItems > 30) settings.numberItems = 30;
    updatePanel();
});

require("sdk/simple-prefs").on("popupHideTimeout", function() {
    if (settings.popupHideTimeout < 1) settings.popupHideTimeout = 1;
    if (settings.popupHideTimeout > 10) settings.popupHideTimeout = 10;
});

/*
 * WIDGET EVENTS
 */
// open selfoss
widget.port.on("widget-left-click", openSelfoss);

//update items
widget.port.on("widget-middle-click", mainProcess);

// show panel
widget.port.on("widget-right-click", function() {
    var node = getItemNodeForWidget(widget);
    if (node != null) {
        panelNumberItems = settings.numberItems;
        panel.port.emit("cleanExpanded");
        fetchItems(cleanUrl);
        panel.show(node);
    }
});

/*
 * PANEL EVENTS
 */
// open selfoss
panel.port.on("panel-open-selfoss", openSelfoss);

// open link
panel.port.on("panel-open-link", function(url) {
    console.log("panel: open link "+url);

    var tabs = require('sdk/tabs');
    for each (var tab in tabs)
        if (tab.url.indexOf(url) !== -1) {
            tab.activate();
            return;
        }
    tabs.open(url);
});

// close panel
panel.port.on("panel-close", function() {
    panel.hide();
});

// open addon preferences
panel.port.on("panel-open-preferences", function() {
    panel.hide();
    openSettings();
});

// update items
panel.port.on("panel-refresh", function() { fetchItems(cleanUrl) });

// mark item as read
panel.port.on("panel-mark-read", function(id) {
    console.log("panel: read "+id);
    markRead(id);
    unreadItemsCount = checkUnread();
    updatePanel();
});

// starr item
panel.port.on("panel-mark-star", function(id) {
    console.log("panel: starr "+id);
    if (currentItems[id] && currentItems[id].starred == "1") {
        APIRequest(APIHandlers["unstarr"], id);
        currentItems[id].starred = 0;
    } else if (currentItems[id] && currentItems[id].starred == 0) {
        APIRequest(APIHandlers["starr"], id);
        currentItems[id].starred = 1;
    }
    updatePanel();
});

// open item from panel
panel.port.on("panel-open-item", function(id) {
    console.log("panel: open "+id);
    if (currentItems[id]) {
        panel.hide();
        require('sdk/tabs').open(currentItems[id].link);
        if (settings.openRead) {// mark as read if such setting set
            markRead(id);
            unreadItemsCount = checkUnread();
            updatePanel();
        }
    }
});

// show more items
panel.port.on("panel-more-items", function() {
    console.log("panel: more");
    panelNumberItems += 3;
    if (panelNumberItems > 20)
        panelNumberItems = 20;
    updatePanel();
});

panel.port.on("panel-resize", function(width, height) {
    if (width != null)
        width = panel.width;
    if (height == null)
        height = panel.height;
    panel.resize(width, height);
});

/*
 * POPUP EVENTS
 */
 // open selfoss
popup.port.on("popup-open-selfoss", openSelfoss);

/*
 * MAIN FUNCS
 */
// main cycle
function mainProcess() {
    updateWidget("...", _("updating"));
    
    var [proto, host]=stripTrailingSlash(settings.url).split("://");
    if (proto && host) {
        cleanUrl = proto+'://'+host; // remember clean url for future use
        request({ // check if already logged in
            url: cleanUrl+APIHandlers["login"],
            onComplete: function (response) {
                if (response.json && response.json.success) {
                    console.log("mainProcess: already logged in");
                    fetchStats(cleanUrl); // logged in, let's check unread items
                } else {
                    if (response.headers["WWW-Authenticate"]) { // not logged in and need http auth
                        var realm = response.headers["WWW-Authenticate"].match(/realm="(.+?)"/)[1]; // extract realm
                        console.log("mainProcess: need http auth for "+cleanUrl+" realm "+realm);

                        require("sdk/passwords").search({ // get credentials for http auth
                            url: cleanUrl,
                            realm: realm,
                            onComplete: function onComplete(credentials) {
                                if (credentials.length > 0) { // if credentials found
                                    request({ // try http auth and check if logged in
                                        url: proto+'://'+credentials[0].username+':'+credentials[0].password+'@'+host+APIHandlers["login"],
                                        onComplete: function (response) {
                                            if (!response.headers["WWW-Authenticate"]) { // http auth successful
                                                console.log("mainProcess: http auth success");

                                                if (response.json && response.json.success) {
                                                    fetchStats(cleanUrl); // and logged in
                                                } else {
                                                    selfossAuth(cleanUrl); // need site auth after http auth, paranoia?!
                                                }
                                            } else {
                                                console.log("mainProcess: http auth failed");
                                                updateWidget(-1, _("credentialsError"));
                                            }
                                        }
                                    }).get();
                                } else {
                                    console.log("mainProcess: http auth credentials not found");
                                    updateWidget(-1, _("credentialsError"));
                                }
                            }
                        });
                    } else {
                        selfossAuth(cleanUrl); // http auth not needed, try site auth
                    }
                }
            }
        }).get();
    } else {
        console.log("mainProcess: invalid url");
        updateWidget(-1, _("invalidUrl"));
    }
}

// selfoss login
function selfossAuth(cleanUrl) {
    require("sdk/passwords").search({ // get credentials for site auth
        url: cleanUrl,
        usernameField: 'username',
        passwordField: 'password',
        realm: null,
        onComplete: function onComplete(credentials) {
            if (credentials.length > 0) { // if credentials found
                request({ // check login with http auth
                    url: cleanUrl+APIHandlers["login"],
                    content: {username: credentials[0].username, password: credentials[0].password},
                    onComplete: function (response) {
                        if (response.json && response.json.success) {
                            console.log("selfossAuth: logged in");
                            fetchStats(cleanUrl);
                        } else {
                            console.log("selfossAuth: auth failed");
                            updateWidget(-1, _("authError"));
                        }
                    }
                }).get();
            } else {
                console.log("selfossAuth: site credentials not found");
                updateWidget(-1, _("credentialsError"));
            }
        }
    });
}

// fetch items
function fetchItems(url) {
    console.log("fetchItems: start");
    request({
        url: url+APIHandlers["items"],
        content: {items: 200, type: "unread"},
        onComplete: function (response) {
            console.log("fetchItems: complete");
            lastUpdated = new Date();
            currentItems = {};
            for (var i = 0; i < response.json.length; i++)
                currentItems[response.json[i].id] = response.json[i]; // fill items hash
            updatePanel();
            unreadItemsCount = checkUnread();;
       }
    }).get();
}

// fetch stats
function fetchStats(url) {
    console.log("fetchStats: start");
    request({
        url: url+APIHandlers["stats"],
        onComplete: function (response) {
            console.log("fetchStats: complete");
            lastUpdated = new Date();
            currentItems = {};

            var count = response.json.unread;

            updateWidgetUnread(count);

            if (settings.enablePopup && (count-unreadItemsCount)>0) {
                var node = getItemNodeForWidget(widget);
                if (node != null && !panel.isShowing) {
                    popup.port.emit("updatePopup", _("unreadPopup", (count-unreadItemsCount)));
                    popup.show(node);
                    timers.setTimeout(function() { popup.hide(); }, settings.popupHideTimeout * 1000);
                }
            }
            unreadItemsCount = count;
       }
    }).get();
}

// check unread items after fetch
function checkUnread() {
    var count = 0;
    for (var id in currentItems) {
        if(currentItems[id].unread == 1)
            count++;
    }
    console.log("checkUnread: "+count+" unread items");
    updateWidgetUnread(count);
    return count;
}

// mark item as read
function markRead(id) {
    if (currentItems[id]) {
        APIRequest(APIHandlers["mark"], id);
        currentItems[id].unread = 0;
    }
}

// selfoss API simple call
function APIRequest(handler, id) {
    request({
        url: cleanUrl+handler+'/'+id
    }).post();
}

// open selfoss tab or switch if exist
function openSelfoss() {
    if (panel.isShowing) panel.hide();
    if (popup.isShowing) popup.hide();
    if ((settings.url != null) && (settings.url != "")) {
        var tabs = require('sdk/tabs');
        for each (var tab in tabs)
            if (tab.url.indexOf(settings.url) !== -1) {
                tab.activate();
                return;
            }
        if ((settings.url != null) && (settings.url != ""))
            tabs.open(settings.url);
    } else {
        openSettings();
    }
}

// update widget unread count
function updateWidgetUnread(count) {
    if (count > 0)
        updateWidget(count, _("unreadItems", count));
    else 
        updateWidget(0, _("noItems"));
}

// update widget
function updateWidget(badgeText, tooltip) {
    // validate settings
    if (settings.fontSize < 6) settings.fontSize = 6;
    if (settings.fontSize > 11) settings.fontSize = 11;
    if (settings.badgeOpacity < 0) settings.badgeOpacity = 0;
    if (settings.badgeOpacity > 100) settings.badgeOpacity = 100;

    // set icon color according status (unread, error, ...)
    var widgetIcon, showBadge;
    switch(badgeText) {
        case 0:
            widgetIcon = "images/widget_inactive.png";
            showBadge = false;
            break;
        case -1:
            widgetIcon = "images/widget_error.png";
            showBadge = false;
            break;
        default:
            widgetIcon = "images/widget_default.png";
            showBadge = settings.showBadge;
    }

    if (widget) {
        console.log("updateWidget");
        if (tooltip != null) {
            if (lastUpdated != null)
                widget.tooltip = tooltip+"\n"+_("lastUpdated", lastUpdated.toLocaleTimeString());
            else
                widget.tooltip = tooltip
        }
        widget.port.emit("updateWidget", widgetIcon, showBadge, badgeText, settings.fontSize, settings.fontColor, settings.bgColor, settings.badgeOpacity);
    }

    currentBadgeText = badgeText; // save current badge text for updating widget while changing settings
}

// update panel
function updatePanel() {
    var error = false;
    var count = 0;
    var countMore = 0;

    for (var id in currentItems) {
        if(currentItems[id].unread == 1) {
            count++;
            if (count > panelNumberItems)
                countMore++; // calculate more count
            currentItems[id].timeago = timeAgo(dateFromString(currentItems[id].datetime)); // fill date with human readable time ago
        }
    }

    var moreText = "";
    if (countMore > 0)
        moreText = _("moreCount", countMore);

    if (currentBadgeText == -1) {
        moreText = _("updateError");
        error = true;
    } else if (count == 0) {
        moreText = _("noItems");
    }

    var lastUpdatedText = _("neverUpdated");
    if (lastUpdated != null)
        lastUpdatedText = _("lastUpdated", timeAgo(lastUpdated));

    panel.port.emit("updateItems", currentItems, lastUpdatedText, panelNumberItems, moreText, cleanUrl, error);
    if (panel.isShowing)
        panel.port.emit("panelResize");
}

// (re-)install timer for updating
function updateInterval() {
    if (settings.interval < 1)
        settings.interval = 1;

    if (timer != null) {
        timers.clearInterval(timer);
        console.log("updateInterval: clear interval");
    }

    timer = timers.setInterval(mainProcess, settings.interval * 1000 * 60);
    console.log("updateInterval: setting interval "+settings.interval+" minutes");
    mainProcess();
}

// open addon settings
function openSettings() {
    require('window-utils').activeBrowserWindow.BrowserOpenAddonsMgr("addons://detail/"+self.id);
}

// get widget DOM node
function getItemNodeForWidget(widget) {
    var item = null;
    
    var doc = require("window/utils").getMostRecentBrowserWindow().document;
    var selector = 'toolbaritem[id$="'+widget.id+'"]';

    for each (var barName in ["addon-bar", "nav-bar", "PersonalToolbar", "toolbar-menubar"]) {
        var bar = doc.getElementById(barName);
        if (bar != null) {
            item = bar.querySelector(selector);
            if (item != null) {
                console.log("getItemNodeForWidget: found widget on "+barName);
                break;
            }
        }
    }

    return item;
}

// convert string to date
function dateFromString(dateString) {
    var reggie = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
    var dateArray = reggie.exec(dateString); 
    var date = new Date(
        (+dateArray[1]),
        (+dateArray[2])-1, // month starts at 0
        (+dateArray[3]),
        (+dateArray[4]),
        (+dateArray[5]),
        (+dateArray[6])
    );
    return date;
}

// human readable time ago
function timeAgo(date) {
    var difference = ((new Date()).getTime() - date.getTime()) / 1000;

    var lengths = [60, 60, 24, 7, 4.35, 12];
    var periods = ["secondsAgo", "minutesAgo", "hoursAgo", "daysAgo", "weeksAgo", "monthsAgo", "yearsAgo"];

    for(var i = 0; difference >= lengths[i]; i++) {
        difference = difference / lengths[i];
    }

    return _(periods[i], Math.round(difference))
}

// remove trailing slash from url
function stripTrailingSlash(str) {
    if(str.substr(-1) == '/')
        return str.substr(0, str.length - 1);
    return str;
}