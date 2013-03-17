var data = require("sdk/self").data;
var settings = require("sdk/simple-prefs").prefs;
var widgets = require("sdk/widget");
var request = require("sdk/request").Request;
var timers = require("sdk/timers");
var tabs = require("sdk/tabs");

var timer;

var badgeText = 0;
var tooltip = "Selfoss notifier";

require("sdk/simple-prefs").on("showBadge", updateIcon);
require("sdk/simple-prefs").on("fontSize", updateIcon);
require("sdk/simple-prefs").on("fontColor", updateIcon);
require("sdk/simple-prefs").on("bgColor", updateIcon);
require("sdk/simple-prefs").on("badgeOpacity", updateIcon);

require("sdk/simple-prefs").on("tryUpdate", checkUnread);

require("sdk/simple-prefs").on("interval", updateInterval);

var widget = widgets.Widget({
    id: "selfoss-notify",
    label: "selfoss",
    contentURL: data.url("icon.html"),
    contentScriptFile: data.url("widget.js"),
    onAttach: function init() {
        console.log("init");
        updateInterval();
    }
});

widget.port.on("left-click", function(){
    if ((settings.url != null) && (settings.url != "")) {
        tabs.open(settings.url);
    }
});

widget.port.on("right-click", function(){
    checkUnread();
});

function checkUnread() {
    console.log("check unread");

    badgeText = "...";
    tooltip = "Updating";
    updateIcon();

    if ((settings.url != null) && (settings.url != "")) {
        request({
            url: stripTrailingSlash(settings.url)+'/api/login',
            content: {username: settings.username, password: settings.password},
            onComplete: function (response) {
                if (response.json != null) {
                    if (response.json.success) {
                        request({
                            url: stripTrailingSlash(settings.url)+'/api/items',
                            onComplete: function (response) {
                                if (response.json != null) {
                                    var count = 0;
                                    for (var i = 0; i < response.json.length; i++) {
                                        if (response.json[i].unread == 1) {
                                            count++;
                                        }
                                    }
                                    console.log(count + " unread items");
                                    badgeText = count;
                                    tooltip = count + " unread items";
                                    updateIcon();
                                } else {
                                    console.log("empty response");
                                    badgeText = 0;
                                    tooltip = "No items";
                                    updateIcon();
                                }
                           }
                        }).get();
                    } else {
                        console.log("login failed");
                        badgeText = -1;
                        tooltip = "Login failed, check your settings";
                        updateIcon();
                    }
                } else {
                    console.log("can't login");
                    badgeText = -1;
                    tooltip = "Can't login, check your settings";
                    updateIcon();
                }
            }
        }).get();
    } else {
        console.log("empty url");
        badgeText = -1;
        tooltip = "Invalid URL, check your settings";
        updateIcon();
    }
}

function updateIcon() {
    if (settings.fontSize < 6) {
        settings.fontSize = 6;
    }
    if (settings.fontSize > 11) {
        settings.fontSize = 11;
    }
    if (settings.badgeOpacity < 0) {
        settings.badgeOpacity = 0;
    }
    if (settings.badgeOpacity > 100) {
        settings.badgeOpacity = 100;
    }

    var iconImage, showBadge;
    switch(badgeText) {
        case 0:
            iconImage = "logo_inactive.png";
            showBadge = false;
            break;
        case -1:
            iconImage = "logo_error.png";
            showBadge = false;
            break;
        default:
            iconImage = "logo.png";
            showBadge = settings.showBadge;
    }
    if (widget) {
        console.log("update icon");
        widget.tooltip = tooltip;
        widget.port.emit("updateIcon", iconImage, showBadge, badgeText, settings.fontSize, settings.fontColor, settings.bgColor, settings.badgeOpacity);
    }
}

function updateInterval() {
    if (settings.interval < 1) {
        settings.interval = 1;
    }
    if (timer != null) {
        timers.clearInterval(timer);
        console.log("clear interval");
    }
    timer = timers.setInterval(checkUnread, settings.interval * 1000 * 60);
    console.log("setting interval " + settings.interval + " minutes");
    checkUnread();
}

function stripTrailingSlash(str) {
    if(str.substr(-1) == '/') {
        return str.substr(0, str.length - 1);
    }
    return str;
}
