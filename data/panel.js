self.port.on("updateItems", function(items, updated, number, more, url, error) {
	var count = 0;
    var htmlItems = "";

    if (items != null) {
    	for (var i = 0; i < items.length; i++) {
            if (items[i].unread == 1) {
            	count++;
                htmlItems += generateEntry(items[i], url);
                if (count >= number)
                    break;
            }
        }
    }

    $("#items").html(htmlItems);
    $("#updated").html(updated);
    $("#more").html(more);
    if (error)
        $("#more").css("color", "red");
    else
        $("#more").css("color", "#3d6d69");

    //console.log($(document).height()); // can't calculate actual height :(
    self.port.emit("panel-resize", null, count*52+78);
});

$(".control").click(function() {
    self.port.emit($(this).attr('id'));
});

$("#items").delegate(".entry-title", "click", function() {
    self.port.emit("panel-open-item", $(this).parent().attr('id'));
});

$("#items").delegate(".entry-star", "click", function() {
    self.port.emit("panel-mark-star", $(this).parent().attr('id'));
});

$("#items").delegate(".entry-unread", "click", function() {
    self.port.emit("panel-mark-read", $(this).parent().attr('id'));
});

$("#more").click(function() {
    self.port.emit("panel-open-selfoss");
});

function generateEntry(item, url) {
    var entry = '';

    entry += '<div class="entry" id="'+item.id+'"">';
    entry += '<img class="entry-unread" src="images/unread.png">';
    if (item.starred == 1)
        entry += '<img class="entry-star" src="images/starred.png">';
    else
        entry += '<img class="entry-star" src="images/unstarred.png">';
    entry += '<img class="entry-icon" src="'+url+'/favicons/'+item.icon+'">';
    entry += '<h2 class="entry-title">'+item.title+'</h2>';
    entry += '<div class="entry-datetime"> • '+item.timeago+'</div>';
    entry += '</div>';

    return entry;
}