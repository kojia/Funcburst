// @licence MIT
var dataset = makeNewComp("Root");
makeTree(dataset);

$(document).ready(function () {
    $('.modal').modal();
    $(".button-collapse").sideNav();
});

// SVG画面サイズ調整
$(document).ready(function () {
    hsize = $(window).height() - ($("#top-nav").height() + $("#tree-tab").height());
    $("main").css("height", hsize + "px");
});
$(window).resize(function () {
    hsize = $(window).height() - $("#top-nav").height();
    $("main").css("height", hsize + "px");
});

// open file
$(document).ready(function () {
    $("#readjson").change(function (e) {
        var file = e.target.files[0];
        // FileReader.onloadイベントに
        // ファイル選択時に行いたい処理を書く
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                // JSONに変換
                dataset = $.parseJSON(reader.result);
            }
            catch (e) {
                // JSONではないファイルを読込んだとき
                alert("error: Invalid Data");
            }
            makeTree(dataset);
        };
        // Textとしてファイルを読み込む
        reader.readAsText(file);
    });
}, false);
// save file
$("#download").click(function () {
    var filename = $(".file-path.validate").val() || "function_tree.json";
    var outJson = JSON.stringify(dataset);
    var blob = new Blob([outJson], { "type": "text/plain" });
    if (window.navigator.msSaveBlob) {
        window.navigator.msSaveBlob(blob, filname);
    } else {
        var a = document.createElement('a');
        $("body").append(a);
        var url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }
});
$("#dataURI").click(function () {
    var outJson = JSON.stringify(dataset, undefined, 2);
    window.open("data:;charset=utf-8," + encodeURIComponent(outJson));
});
// open svg in another window
$("#show-svg").click(function () {
    var svg = $("#compTreeSVG");
    var showsvg = $("<svg>");
    showsvg.attr({
        "xmlns": "http://www.w3.org/2000/svg",
        "width": $("#compTreeSVG").width() * 1.1,
        "height": $("#compTreeSVG").height() * 1.1
    });
    showsvg.html(svg.html());
    window.open("data:image/svg+xml;charset=utf-8,"
        + encodeURIComponent($("<div>").append(showsvg).html()));
});
// reload tree view
$("#reload").click(function () {
    d3.select("#comp-edit")
        .style("display", "none");
    d3.select("#func-edit")
        .style("display", "none");
    makeTree(dataset);
})

function getNodeHeight() {
    return 15;
}
function getNodeWidth() {
    return 250;
}
function getCompLabelWidth() {
    return getNodeWidth() - 20;
}
function getFuncLabelWidth() {
    return getNodeWidth() - 20;
}
function getParamLabelWidth() {
    return getNodeWidth() - 30;
}


function makeTree(dataset) {
    // svg initialize
    d3.select("#compTreeSVG").select("svg").remove();

    // hierarchy initialize
    root = d3.hierarchy(dataset, function (d) {
        return d["children"];
    });

    root.eachBefore(function (node) {
        // set component-node name label string array to fit node width
        node.label = splitStrByWidth(node.data.name, getCompLabelWidth());
        // set function-node data
        node.func = Array();  // create array for func-node
        node.data.func.forEach(function (funcElm, i) {
            node.func.push({
                "data": funcElm,
                "isb": node,  // func-node is solved by solution "component-node"
                "label": splitStrByWidth(funcElm.name, getFuncLabelWidth())
            });
        });
        // set parameter-node data
        node.param = Array();  // create array for param-node
        if (node.data.param == undefined) {
            node.data.param = Array();
        }
        node.data.param.forEach(function (paramElm, i) {
            node.param.push({
                "data": paramElm,
                "icb": node,  // param-node is constrained by solution "component-node"
                "label": splitStrByWidth(paramElm.name, getParamLabelWidth())
            });
        });
    });

    // tree setting
    var tree = d3.tree()
        // .size([$(window).height() - $("#top-nav").height(), $("#compTreeSVG").width() * 0.9])
        .nodeSize([getNodeHeight(), getNodeWidth()])
        .separation(nodeSeparate);

    function nodeSeparate(a, b) {
        var sep = 2;  // space between nodes

        // comp-, func-, parm-nodeのラベル幅を求める(子ノードは考慮しない)
        var getWidth = function (node) {
            var width = 0;
            width += node.label.length;
            node.func.forEach(function (f) {
                width += f.label.length;
            })
            node.param.forEach(function (p) {
                width += p.label.length;
            })
            return width;
        }

        // 共通の親ノードまで遡ってノード幅広さを拡張する
        // return { "node": node, "width": _width }
        var widenForward = function (node, root, width = undefined) {
            var _width;
            if (width === undefined) {
                _width = getWidthOneBack(node);
            } else {
                _width = width;
            }
            if (node.parent == root || node == root) {
                return { "node": node, "width": _width };
            } else {
                // 同じ親に属するノードのうち、引数ノードより上側のノードの幅を加算
                for (var i = 0; i < node.parent.children.indexOf(node); i++) {
                    _width[0] += getWidthOneBack(node.parent.children[i])[1]
                        + getWidthOneBack(node.parent.children[i])[1]
                        + sep;
                }
                // 同じ親に属するノードのうち、引数ノードより下側のノードの幅を加算
                for (var i = node.parent.children.indexOf(node) + 1; i < node.parent.children.length; i++) {
                    _width[1] += getWidthOneBack(node.parent.children[i])[0]
                        + getWidthOneBack(node.parent.children[i])[1]
                        + sep;
                }
                return widenForward(node.parent, root, _width);
            }
        };
        // treeの子nodeを下ってノード幅広さを拡張する
        // 戻り値: 幅のarray, index 0: 上側の余白, index 1: 下側の余白
        var widenBackward = function (node, depth = undefined) {
            var _getChildrenWidth = function (node, depth) {
                var childrenWidth = 0;
                if ((depth != undefined || depth >= 0) && node.children != undefined) {
                    var childrenWidth = node.children
                        .reduce(function (_a, _b) {
                            var _child = _getChildrenWidth(_b, depth - 1);
                            var _this = getWidth(_b);
                            var _width = _this > _child ? _this : _child;
                            return _a + _width + sep;
                        }, 0);
                }
                return childrenWidth;
            }
            var childrenWidth = _getChildrenWidth(node);
            var thisWidth = getWidth(node);
            var _result = Array();  //index 0: 上側の余白, index 1: 下側の余白
            _result[0] = childrenWidth / 2;
            _result[1] = thisWidth > childrenWidth / 2 ? thisWidth : childrenWidth / 2;
            return _result;
        }
        // ノードの幅広さを求める関数
        // 戻り値: 幅のarray, index 0: 上側の余白, index 1: 下側の余白
        var getWidthOneBack = function (node) {
            return widenBackward(node, 1);
        };

        if (a.parent == b.parent) {
            var a_i = a.parent.children.indexOf(a);
            var b_i = b.parent.children.indexOf(b);
            var begin = a_i > b_i ? b_i : a_i;
            var end = a_i > b_i ? a_i : b_i;
            var _result = getWidthOneBack(a.parent.children[begin])[1] + sep;
            for (var i = begin + 1; i < end; i++) {
                _result += getWidthOneBack(a.parent.children[i])[0]
                    + getWidthOneBack(a.parent.children[i])[1] + sep;
            }
            _result += getWidthOneBack(a.parent.children[end])[0];
            return _result;
        }
        else {
            var jptrA = getJptr(a);
            var jptrB = getJptr(b);
            var jptrIndex = 0;
            do {
                if (jptrA[jptrIndex] != jptrB[jptrIndex]) {
                    if (jptrA[jptrIndex] == "/") {
                        // aとbが親子関係の場合: jptrは"/"の有無で違いが発生
                    } else {
                        // aとbが兄弟関係の場合: jptrは数字が異なる
                        // 共通の親ノードのjson pointerを得る
                        while (jptrA[jptrIndex] != "/") {
                            jptrIndex--;
                        }
                        jptrIndex -= 9;
                    }
                    break;
                }
                jptrIndex++
            } while (1)
            // jptrAとjptrBがともに持つ親ノード
            var rootAandB = perseJptr(root, jptrA.substring(0, jptrIndex))

            // jptrAとjptrBを共通の親ノードまで遡る
            var widenA = widenForward(a, rootAandB);
            var widenB = widenForward(b, rootAandB);
            // aとbが親子関係の場合
            if (widenA.node == rootAandB || widenB.node == rootAandB) {
                var _prnt;
                var _child;
                if (widenA.node == rootAandB) {
                    _prnt = widenA;
                    _child = widenB;
                } else {
                    _prnt = widenB;
                    _child = widenA;
                }
                var _wholeWidth = 0;  // 子全体の幅
                var _targetWidth = 0;  // _childまでの幅
                var _index = _prnt.node.children.indexOf(_child.node);
                _prnt.node.children.forEach(function (ch, i, arr) {
                    var _childWidth = widenBackward(ch);
                    if (i == arr.length) {
                        _wholeWidth += _childWidth[0];
                    } else {
                        _wholeWidth += _childWidth[0] + _childWidth[1] + sep;
                    }
                    if (_index < i) {
                        _targetWidth += _childWidth[0] + _childWidth[1] + sep;
                    } else if (_index == i) {
                        _targetWidth += _childWidth[0];
                    }
                });
                return Math.abs(_wholeWidth / 2 - _targetWidth);
            }
            // jptrAとjptrBの距離を求める
            var a_i = widenA.node.parent.children.indexOf(widenA.node);
            var b_i = widenB.node.parent.children.indexOf(widenB.node);
            var begin = a_i > b_i ? b_i : a_i;
            var end = a_i > b_i ? a_i : b_i;
            var _result = 0;
            for (var i = begin; i < end; i++) {
                if (i == a_i) {
                    _result += widenA.width[1] + sep;
                } else if (i == b_i) {
                    _result += widenB.width[1] + sep;
                } else {
                    _result += getWidthOneBack(widenA.node.parent.children[i])[1] + sep;
                }
            }
            return _result;
        }
    };

    // create tree layout
    tree(root);

    // labelの並列方向単位長
    var kx = getNodeHeight();
    // func-, param-nodeの親子関係リンク挿入とfunc-, param-nodeの表示位置計算
    root.each(function (node) {
        var lineOffset = node.label.length;  // x座標オフセット量
        node.func.forEach(function (funcElm, i, funcArr) {
            funcArr[i].x = node.x + kx * lineOffset;
            funcArr[i].y = node.y + kx / 2;
            // オフセット量加算
            lineOffset += funcElm.label.length;
            // set parent for each func-node
            funcArr[i].parents = funcElm.data.parents.map(function (p) {
                return perseJptr(root, p);
            });
            // add children of each func-node
            funcElm.parents.forEach(function (funcPrnt) {
                if (funcPrnt.children === undefined) {
                    funcPrnt.children = Array();
                }
                funcPrnt.children.push(funcElm);
            })
        });
        node.param.forEach(function (paramElm, i, paramArr) {
            paramArr[i].x = node.x + kx * lineOffset;
            paramArr[i].y = node.y + kx;
            // オフセット量加算
            lineOffset += paramElm.label.length;
            // set parent for each param-node
            paramArr[i].parents = paramElm.data.parents.map(function (p) {
                return perseJptr(root, p);
            });
            // set child for parent func-node that is set above
            paramElm.parents.forEach(function (paramPrnt) {
                if (paramPrnt.children === undefined) {
                    paramPrnt.children = Array();
                }
                paramPrnt.children.push(paramElm);
            })
            // parameter doesn't have children
            // (prameter doesn't have parameter)
        });
    });

    // func node のarrayを返す関数
    root.funcDescendants = function () {
        return this.descendants()
            .reduce(function (a, b) { return a.concat(b.func); }, Array());
    };
    // func node の親子ペアのリストを返す
    root.funcParentChild = function () {
        return this.funcDescendants()
            .filter(function (elm) { return elm.parents.length; })
            .map(function (elm) {
                return elm.parents.map(function (prnt) {
                    return { "child": elm, "parent": prnt }
                })
            })
            .reduce(function (a, b) { return a.concat(b); }, Array());
    }

    // param-node のarrayを返す関数
    root.paramDescendants = function () {
        return this.descendants()
            .reduce(function (a, b) { return a.concat(b.param); }, Array());
    };
    // param-node を子に持つペアのリストを返す
    root.paramParentChild = function () {
        return this.paramDescendants()
            .filter(function (elm) { return elm.parents.length; })
            .map(function (elm) {
                return elm.parents.map(function (prnt) {
                    return { "child": elm, "parent": prnt }
                })
            })
            .reduce(function (a, b) { return a.concat(b); }, Array());
    }

    // treeを入れるコンテナを作成
    var zoom = d3.zoom()
        .scaleExtent([.2, 10])
        .translateExtent(
        [[$("#compTreeSVG").width() * -2, $("#compTreeSVG").height() * -2],
        [$("#compTreeSVG").width() * 2, $("#compTreeSVG").height() * 2]])
        .on("zoom", zoomed);
    function zoomed() {
        d3.select("#compTreeSVG .treeContainer")
            .attr("transform", d3.event.transform);
    }

    var svg = d3.select("#compTreeSVG")
        .attr("width", "100%")
        .attr("height", "100%")
        .call(zoom);

    // ノード間を線でつなぐ
    var link = d3.select("#compTreeSVG .treeContainer").selectAll(".link")
        .data(root.descendants().slice(1));
    link.exit().remove();
    var enteredLink = link.enter()
        .append("path");
    enteredLink.merge(link)
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", [2, 1])
        .attr("stroke", "gray")
        .attr("d", function (d) {
            return "M" + d.y + "," + d.x
                + "C" + (d.y + d.parent.y) / 2 + "," + d.x
                + " " + (d.y + d.parent.y) / 2 + "," + d.parent.x
                + " " + d.parent.y + "," + d.parent.x;
        });

    // ノード作成
    var node = d3.select("#compTreeSVG .treeContainer")
        .selectAll(".node")
        .data(root.descendants());
    node.exit().remove();
    var enteredNode = node.enter()
        .append("g");
    enteredNode.append("circle")
        .attr("r", 4)
        .attr("fill", "teal");
    enteredNode.append("text")
        .attr("font-size", getNodeHeight() + "px");
    var updatedNode = enteredNode.merge(node);
    // ノードに円とテキストを表示
    updatedNode.attr("class", "node")
        .attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });
    updatedNode.select("text").html(function (d) { return tspanStringify(d.label) });
    updatedNode.on("click", clickNode);

    // func-nodeをSVG描画
    // func-nodeをつなぐ線の色を設定
    var xArray = root.funcDescendants()
        .map(function (node) {
            return node.x;
        })
    var xMin = Math.min.apply(null, xArray);
    var xMax = Math.max.apply(null, xArray);
    var getLinkColor = function (x) {
        var h = 350 * (x - xMin) / (xMax - xMin);
        return "hsla(" + h + ",100%,60%,1)";
    };

    // func-nodeを線でつなぐ
    var funcLink = d3.select("#compTreeSVG .treeContainer")
        .selectAll(".funcLink")
        .data(root.funcParentChild());
    funcLink.exit().remove();
    var enteredFuncLink = funcLink.enter()
        .append("path");
    enteredFuncLink.merge(funcLink)
        .attr("class", "funcLink")
        .attr("fill", "none")
        .attr("stroke", function (d) { return getLinkColor(d.child.x); })
        .attr("d", function (d) {
            if (d.child.y == d.parent.y) {  // 同じdepthの場合
                return "M" + d.child.y + "," + d.child.x
                    + "C" + (d.child.y - getNodeHeight() * 2) + "," + (d.child.x + d.parent.x) / 2
                    + " " + (d.child.y + getNodeHeight() * 2) + "," + d.parent.x
                    + " " + d.parent.y + "," + d.parent.x;
            } else {
                return "M" + d.child.y + "," + d.child.x
                    + "C" + (d.child.y + d.parent.y) / 1.8 + "," + d.child.x
                    + " " + (d.child.y + d.parent.y) / 1.8 + "," + d.parent.x
                    + " " + d.parent.y + "," + d.parent.x;
            }
        });

    // func-nodeをsvgに追加
    var funcNode = d3.select('#compTreeSVG .treeContainer')
        .selectAll(".funcNode")
        .data(root.funcDescendants());
    funcNode.exit().remove();
    var enteredFuncNode = funcNode.enter()
        .append("g");
    enteredFuncNode.append("circle")
        .attr("r", 3)
        .attr("fill", "red");
    enteredFuncNode.append("text")
        .attr("font-size", getNodeHeight() * 0.9 + "px")
        .attr("fill", "dimgray")
        .attr("dominant-baseline", "middle");
    var updatedFuncNode = enteredFuncNode.merge(funcNode);
    // func-nodeのcircleとtextを描画
    updatedFuncNode.attr("class", "funcNode")
        .attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });
    updatedFuncNode.select("text")
        .html(function (d) { return tspanStringify(d.label) });
    updatedFuncNode.on("click", clickFuncNode);

    // param-nodeを線でつなぐ
    var paramLink = d3.select("#compTreeSVG .treeContainer")
        .selectAll(".paramLink")
        .data(root.paramParentChild());
    paramLink.exit().remove();
    var enteredParamLink = paramLink.enter()
        .append("path");
    enteredParamLink.merge(paramLink)
        .attr("class", "paramLink")
        .attr("fill", "none")
        .attr("stroke", function (d) { return getLinkColor(d.child.x); })
        .attr("d", function (d) {
            if (d.child.icb == d.parent.isb) {  // 同じcomponentの場合
                return "M" + d.child.y + "," + d.child.x
                    + "C" + (d.child.y - getNodeHeight() * 2) + "," + (d.child.x + d.parent.x) / 2
                    + " " + (d.child.y + getNodeHeight() * 2) + "," + d.parent.x
                    + " " + d.parent.y + "," + d.parent.x;
            } else {
                return "M" + d.child.y + "," + d.child.x
                    + "C" + (d.child.y + d.parent.y) / 1.8 + "," + d.child.x
                    + " " + (d.child.y + d.parent.y) / 1.8 + "," + d.parent.x
                    + " " + d.parent.y + "," + d.parent.x;
            }
        });

    // param-nodeをsvgに追加
    var paramNode = d3.select('#compTreeSVG .treeContainer')
        .selectAll(".paramNode")
        .data(root.paramDescendants());
    paramNode.exit().remove();
    var enteredParamNode = paramNode.enter()
        .append("g");
    enteredParamNode.append("circle")
        .attr("r", 3)
        .attr("fill", "orange");
    enteredParamNode.append("text")
        .attr("font-size", getNodeHeight() * 0.9 + "px")
        .attr("fill", "dimgray")
        .attr("dominant-baseline", "middle");
    var updatedParamNode = enteredParamNode.merge(paramNode);
    // param-nodeのcircleとtextを描画
    updatedParamNode.attr("class", "paramNode")
        .attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });
    updatedParamNode.select("text")
        .html(function (d) { return tspanStringify(d.label) });
    updatedParamNode.on("click", clickParamNode);

    // 画面サイズに合わせてツリーをオフセット&スケール
    var _is_block = true;
    if ($("#comp-tree").css("display") == "none") {
        _is_block = false;
        $("#comp-tree").css("display", "block");
    }
    var bbox = $("#compTreeSVG .treeContainer")[0].getBBox();
    var k = $("#comp-tree").height() / bbox.height * 0.85;
    k = k > 10 ? 10 : k;
    var ty = bbox.height / 2;
    ty = ty < 150 ? 150 : ty;
    svg.call(zoom.transform, d3.zoomIdentity
        .translate(10, ty + 10)
        .scale(k));
    if (_is_block == false) {
        $("#comp-tree").css("display", "none");
    }

    makeFMTree(root);
};

function tspanStringify(strArr) {
    var _html = "";
    strArr.forEach(function (str, index) {
        _html += '<tspan class="line' + index + '"' + 'y="' + index + 'em" x="0em">'
            + str + '</tspan>';
    });
    return _html;
}

// ノードクリック時の挙動
function clickNode(data) {
    console.log(data);

    setEditPane("comp");

    // bind name
    document.compName.reset();  // reset form
    d3.select("#comp-edit #name")
        .attr("value", data.data.name)
        .on("change", function () {
            data.data.name = d3.event.target.value;
            makeTree(dataset);
        });
    // bind parent
    var prnt = d3.select("#comp-parent")
        .selectAll("li.collection-item")
        .data(function () { return data.parent ? [data.parent] : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li")
    enteredPrnt.append("input");
    enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item")
        .select("input")
        .attr("type", "text")
        .attr("value", function (d) { return d === null ? "no parent" : d.data.name; });
    // bind children
    var cldrn = d3.select("#comp-children")
        .selectAll("li.collection-item")
        .data(function () { return data.children ? data.children : []; });
    cldrn.exit().remove();
    var enteredCldrn = cldrn.enter()
        .append("li");
    enteredCldrn.merge(cldrn)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for children
    d3.select("#comp-children")
        .selectAll("li.collection-item")
        .append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-child button
    var addChildBtn = d3.select("#comp-children")
        .append("li")
        .attr("class", "collection-item add")
        .append("button")
        .attr("class", "waves-effect waves-light btn")
        .attr("href", "#modal-comp-add-child");
    addChildBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-child button is clicked 
    var addChild = function () {
        var _compName = $("#input-comp-add-child").val();
        var newObj = makeNewComp(_compName);
        if (data.data.children === undefined) {
            data.data["children"] = [];
        }
        data.data.children.push(newObj);
        var _jptr = getJptr(data);
        makeTree(dataset);
        clickNode(perseJptr(root, _jptr));
    }
    addChildBtn.on("click", function () {
        $("#modal-comp-add-child").modal("open");
        // add child when enter key pressed
        d3.select("#modal-comp-add-child form")
            .on("submit", function () {
                addChild();
                $("#modal-comp-add-child").modal("close");
                return false;
            });
        $("#modal-comp-add-child form")[0].reset();  // inputテキストボックスを空にする
        $("#input-comp-add-child").focus();  // テキストボックスにフォーカス
        d3.select("#modal-comp-add-child a")  // behavior when AGREE button clicked
            .on("click", addChild);
    })
    // Sortable List Option for Children
    if ("compChildrenSort" in window) { compChildrenSort.destroy(); }
    var el = document.getElementById("comp-children");
    compChildrenSort = Sortable.create(el, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                var _del = function () {
                    item.parentNode.removeChild(item); // remove sortable item
                    // 子Nodeの削除
                    data.data.children.splice(evt.oldIndex - 1, 1);
                    // 子Node削除によりjson pointerが繰り上がる
                    var _jptr = data == root ? "" : getJptr(data);
                    _jptr += "/children/" + String(evt.oldIndex - 1);
                    delJptr(data, _jptr)
                    makeTree(dataset);
                }
                confirmDelNode(data.data.children[evt.oldIndex - 1].name, _del);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _jptr = data == root ? "" : getJptr(data);
            var _jptr_old = _jptr + "/children/" + (_old - 1);
            var _jptr_new = _jptr + "/children/" + (_new - 1);
            // temporary variable of child element of evt.oldIndex
            var _t = data.data.children[_old - 1];
            // old <- new
            data.data.children[_old - 1] = data.data.children[_new - 1];
            // new <- old
            data.data.children[_new - 1] = _t;
            // swap json pointer indicating parent of func-, param-node
            swapJptr(data, _jptr_old, _jptr_new);
            // データ再構築
            var _jptr = getJptr(data);
            makeTree(dataset);
            clickNode(perseJptr(root, _jptr));
        }
    });

    // bind func-nodes
    var func = d3.select("#comp-func")
        .selectAll("li.collection-item")
        .data(function () { return data.func ? data.func : []; });
    func.exit().remove();
    var enteredFunc = func.enter()
        .append("li");
    var updatedFunc = enteredFunc.merge(func)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for func-Node
    updatedFunc.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-func-node button
    var addFuncBtn = d3.select("#comp-func")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addFuncBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-func-node button is clicked 
    var addFunc = function () {
        var _name = $("#input-comp-add-func").val();
        var newObj = makeNewFunc(_name);
        if (data.data.func === undefined) {
            data.data["func"] = [];
        }
        data.data.func.push(newObj);
        var _jptr = getJptr(data);
        makeTree(dataset);
        clickNode(perseJptr(root, _jptr));
    }
    addFuncBtn.on("click", function () {
        $("#modal-comp-add-func").modal("open");
        // add func-node when enter key pressed
        d3.select("#modal-comp-add-func form")
            .on("submit", function () {
                addFunc();
                $("#modal-comp-add-func").modal("close");
                return false;
            });
        $("#modal-comp-add-func form")[0].reset();  // inputテキストボックスを空にする
        $("#input-comp-add-func").focus();  // テキストボックスにフォーカス
        d3.select("#modal-comp-add-func a")  // behavior when AGREE button clicked
            .on("click", addFunc);
    });
    // func-Node のSortable設定
    if ("compFuncSort" in window) { compFuncSort.destroy(); }
    var el_func = document.getElementById("comp-func");
    compFuncSort = Sortable.create(el_func, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                var _del = function () {
                    item.parentNode.removeChild(item); // remove sortable item
                    // dataから削除
                    data.data.func.splice(evt.oldIndex - 1, 1);
                    // 削除したfunc-nodeを親としているjson pointerを削除
                    var _jptr = getJptr(data) + "/func/" + String(evt.oldIndex - 1);
                    delJptr(data, _jptr);
                    // データ再構築
                    var _jptr = getJptr(data);
                    makeTree(dataset);
                    clickNode(perseJptr(root, _jptr));
                }
                confirmDelNode(data.data.func[evt.oldIndex - 1].name, _del);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _jptr = data == root ? "" : getJptr(data);
            var _jptr_old = _jptr + "/func/" + (_old - 1);
            var _jptr_new = _jptr + "/func/" + (_new - 1);
            // temporary variable for func-node element of evt.oldIndex
            var _t = data.data.func[_old - 1];
            // old <- new
            data.data.func[_old - 1] = data.data.func[_new - 1];
            // new <- old
            data.data.func[_new - 1] = _t;
            // swap
            swapJptr(data, _jptr_old, _jptr_new);
            // データ再構築
            var _jptr = getJptr(data);
            makeTree(dataset);
            clickNode(perseJptr(root, _jptr));
        }
    });

    // bind param-node 
    var param = d3.select("#comp-param")
        .selectAll("li.collection-item")
        .data(function () { return data.param ? data.param : []; });
    param.exit().remove();
    var enteredParam = param.enter()
        .append("li");
    var updatedParam = enteredParam.merge(param)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
    // add remove button for param-Node
    updatedParam.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-param-node button
    var addParamBtn = d3.select("#comp-param")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParamBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-param-node button is clicked 
    var addParam = function () {
        var _name = $("#input-comp-add-param").val();
        var newObj = makeNewParam(_name);
        if (data.data.param === undefined) {
            data.data["param"] = [];
        }
        data.data.param.push(newObj);
        var _jptr = getJptr(data);
        makeTree(dataset);
        clickNode(perseJptr(root, _jptr));
    }
    addParamBtn.on("click", function () {
        $("#modal-comp-add-param").modal("open");
        // add param-node when enter key pressed
        d3.select("#modal-comp-add-param form")
            .on("submit", function () {
                addParam();
                $("#modal-comp-add-param").modal("close");
                return false;
            });
        $("#modal-comp-add-param form")[0].reset();  // inputテキストボックスを空にする
        $("#input-comp-add-param").focus();  // テキストボックスにフォーカス
        d3.select("#modal-comp-add-param a")  // behavior when AGREE button clicked
            .on("click", addParam);
    });
    // Sortable list option for param of component
    if ("compParamSort" in window) { compParamSort.destroy(); }
    var el_param = document.getElementById("comp-param");
    compParamSort = Sortable.create(el_param, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                var _del = function () {
                    item.parentNode.removeChild(item); // remove sortable item
                    // dataから削除
                    data.data.param.splice(evt.oldIndex - 1, 1);
                    // データ再構築
                    var _jptr = getJptr(data);
                    makeTree(dataset);
                    clickNode(perseJptr(root, _jptr));
                }
                confirmDelNode(data.data.param[evt.oldIndex - 1].name, _del);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            // temporary variable for func-node element of evt.oldIndex
            var _t = data.data.param[_old - 1];
            // old <- new
            data.data.param[_old - 1] = data.data.param[_new - 1];
            // new <- old
            data.data.param[_new - 1] = _t;
            // データ再構築
            var _jptr = getJptr(data);
            makeTree(dataset);
            clickNode(perseJptr(root, _jptr));
        }
    });
}

// func-nodeクリック時の挙動
function clickFuncNode(data) {
    console.log(data);

    setEditPane("func");

    // bind name
    document.funcName.reset();  // reset form
    d3.select("#func-edit #funcName")
        .attr("value", data.data.name)
        .on("change", function () {
            data.data.name = d3.event.target.value;
            makeTree(dataset);
        });

    // bind comp-node which func is solved by (isb)
    var isb = d3.select("#func-isb")
        .selectAll("li.collection-item")
        .data(function () { return data.isb ? [data.isb] : []; });
    isb.exit().remove();
    var enteredIsb = isb.enter()
        .append("li");
    var updatedIsb = enteredIsb.merge(isb)
        .attr("class", "collection-item")
        .text(function (d) { return d.data.name; });

    // bind parent
    d3.select("#func-parents .add")
        .remove();  // 以前に作成したaddボタンを削除
    var prnt = d3.select("#func-parents")
        .selectAll("li.collection-item")
        .data(function () { return data.parents ? data.parents : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li")
    var updatedPrnt = enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item drag")
        .text(function (d) { return d === null ? "no parent" : d.data.name; });
    // add remove button to each parent
    updatedPrnt.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-parent button
    var addParentBtn = d3.select("#func-parents")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParentBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-parent button is clicked 
    addParentBtn.on("click", function () {
        // 選択されているfuncとisb関係にあるcomp-nodeのancestorにあるfuncを探索
        var addiable = data.isb.ancestors()
            .reduce(function (pre, node) {
                return pre.concat(node.func);
            }, Array())
            .filter(function (elm) {
                if (elm == data || data.parents.indexOf(elm) != -1) {
                    return false;
                }
                return true;
            })
        var prnt = d3.select("#add-func-parent")
            .selectAll("a.collection-item")
            .data(addiable);
        prnt.exit().remove();
        var enteredPrnt = prnt.enter()
            .append("a")
            .attr("href", "#!")
            .attr("class", "collection-item");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-name");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-isb");
        var margedPrnt = enteredPrnt.merge(prnt);
        // show addiable func-node
        margedPrnt.select(".side-prnt-name")
            .text(function (d) {
                return d.data.name;
            })
        margedPrnt.select(".side-prnt-isb")
            .text(function (d) {
                return d.isb.data.name;
            });
        // click時の挙動
        margedPrnt.on("click", function (prnt) {
            var _ptr = getJptr(prnt.isb,
                "/func/" + prnt.isb.func.indexOf(prnt));
            data.data.parents.push(_ptr);
            // データ再構築
            $("#side-add-func-parent").sideNav("hide");
            var _jptr = getJptr(data.isb,
                "/func/" + data.isb.func.indexOf(data));
            makeTree(dataset);
            clickFuncNode(perseJptr(root, _jptr));
        });
        $("#side-add-func-parent").sideNav("show");
    });
    // Sortable List Option for parents of function
    if ("funcParentsSort" in window) { funcParentsSort.destroy(); }
    var el = document.getElementById("func-parents");
    funcParentsSort = Sortable.create(el, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // 子要素の削除
                data.data.parents.splice(evt.oldIndex - 1, 1);
                makeTree(dataset);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _oldPrnt = data.data.parents[_old - 1];
            data.data.parents[_old - 1] = data.data.parents[_new - 1];
            data.data.parents[_new - 1] = _oldPrnt;
            // データ再構築
            makeTree(dataset);
        }
    });

    var cldrn = d3.select("#func-children")
        .selectAll("li.collection-item")
        .data(function () { return data.children ? data.children : []; });
    cldrn.exit().remove();
    var enteredCldrn = cldrn.enter()
        .append("li");
    enteredCldrn.merge(cldrn)
        .attr("class", "collection-item drag")
        .text(function (d) { return d.data.name; });
}

// param-nodeクリック時の挙動
function clickParamNode(data) {
    console.log(data);

    setEditPane("param")

    // bind definition of parameter
    document.paramName.reset();  // reset form
    d3.select("#paramName")
        .attr("value", data.data.name)
        .on("change", function () {
            data.data.name = d3.event.target.value;
            makeTree(dataset);
        });

    // bind comp-node which parameter is constrained by (icb)
    var icb = d3.select("#param-icb")
        .selectAll("li.collection-item")
        .data(function () { return data.icb ? [data.icb] : []; });
    icb.exit().remove();
    var enteredIcb = icb.enter()
        .append("li");
    var updatedIcb = enteredIcb.merge(icb)
        .attr("class", "collection-item")
        .text(function (d) { return d.data.name; });

    // bind parent
    d3.select("#param-parents .add")
        .remove();  // 以前に作成したaddボタンを削除
    var prnt = d3.select("#param-parents")
        .selectAll("li.collection-item")
        .data(function () { return data.parents ? data.parents : []; });
    prnt.exit().remove();  // 減った要素を削除
    var enteredPrnt = prnt.enter()  // 増えた要素を追加
        .append("li")
    var updatedPrnt = enteredPrnt.merge(prnt)  // 内容更新
        .attr("class", "collection-item drag")
        .text(function (d) { return d === null ? "no parent" : d.data.name; });
    // add remove button to each parent
    updatedPrnt.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove tiny material-icons")
        .text("remove_circle_outline");
    // insert add-parent button
    var addParentBtn = d3.select("#param-parents")
        .append("li").attr("class", "collection-item add")
        .append("button").attr("class", "waves-effect waves-light btn");
    addParentBtn.text("Add")
        .append("i").attr("class", "material-icons left")
        .text("add");
    // behavior when add-parent button is clicked 
    addParentBtn.on("click", function () {
        // 選択されているparamとicb関係にあるcomp-nodeのancestorにあるfuncを探索
        var addiable = data.icb.ancestors()
            .reduce(function (pre, node) {
                return pre.concat(node.func);
            }, Array())
            .filter(function (elm) {
                if (elm == data || data.parents.indexOf(elm) != -1) {
                    return false;
                }
                return true;
            })
        var prnt = d3.select("#add-param-parent")
            .selectAll("a.collection-item")
            .data(addiable);
        prnt.exit().remove();
        var enteredPrnt = prnt.enter()
            .append("a")
            .attr("href", "#!")
            .attr("class", "collection-item");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-name");
        enteredPrnt.append("div")
            .attr("class", "side-prnt-isb");
        var margedPrnt = enteredPrnt.merge(prnt);
        // show addiable func-node
        margedPrnt.select(".side-prnt-name")
            .text(function (d) {
                return d.data.name;
            })
        margedPrnt.select(".side-prnt-isb")
            .text(function (d) {
                return d.isb.data.name;
            });
        // click時の挙動
        margedPrnt.on("click", function (prnt) {
            var prntPtr = getJptr(prnt.isb,
                "/func/" + prnt.isb.func.indexOf(prnt));
            data.data.parents.push(prntPtr);
            // データ再構築
            $("#side-func-parent").sideNav("hide");
            var thisPtr = getJptr(data.icb,
                "/param/" + data.icb.param.indexOf(data));
            makeTree(dataset);
            clickParamNode(perseJptr(root, thisPtr));
        });
        $("#side-add-param-parent").sideNav("show");
    });
    // Sortable List Option for parents of parameter
    if ("paramParentsSort" in window) { paramParentsSort.destroy(); }
    var el = document.getElementById("param-parents");
    paramParentsSort = Sortable.create(el, {
        draggable: ".collection-item.drag",
        filter: ".js-remove",
        onFilter: function (evt) {
            var item = evt.item;
            var ctrl = evt.target;
            if (Sortable.utils.is(ctrl, ".js-remove")) {  // Click on remove button
                item.parentNode.removeChild(item); // remove sortable item
                // 子要素の削除
                data.data.parents.splice(evt.oldIndex - 1, 1);
                makeTree(dataset);
            }
        },
        // drag後の処理
        onUpdate: function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _oldPrnt = data.data.parents[_old - 1];
            data.data.parents[_old - 1] = data.data.parents[_new - 1];
            data.data.parents[_new - 1] = _oldPrnt;
            // データ再構築
            makeTree(dataset);
        }
    });
}

// perse function means tree from component tree
function makeFMTree(root) {
    var fmData = {
        "fmcat": "root",
        "children": [],
        "node": { "data": { "name": "Customer" } }
    };
    var setFMchild = function (node) {
        if (node.children === undefined) {
            return Array();
        } else {
            return node.children
                .filter(function (child) {
                    return child.isb != undefined;
                })
                .map(function (child) {
                    return {
                        "fmcat": "func",
                        "node": child,
                        "children": [{
                            "fmcat": "means",
                            "node": child.isb,
                            "children": setFMchild(child),
                            "param": child.param == undefined ? [] :
                                child.param
                        }]
                    }
                })
        }
    }
    root.func.forEach(function (fnode) {
        fmData.children.push({
            "fmcat": "func",
            "node": fnode,
            "children": [{
                "fmcat": "means",
                "node": root,
                "children": setFMchild(fnode),
                "param": fnode.children == undefined ? [] :
                    fnode.children.filter(function (e) {
                        return e.isb === undefined;
                    })
            }]
        })
    });

    // hierarchy initialize
    fmroot = d3.hierarchy(fmData, function (d) {
        return d["children"];
    })

    // set label, node, and data
    fmroot.eachBefore(function (fmnode) {
        fmnode.cnode = fmnode.data.node;
        fmnode.cdata = fmnode.data.node.data;
        fmnode.label = splitStrByWidth(
            fmnode.cdata.name, getFMLabelWidth());
        // set parameter node
        if (fmnode.data.fmcat == "means") {
            fmnode.param = fmnode.data.param
                .map(function (d) {
                    return {
                        "cnode": d,
                        "cdata": d.data,
                        "label": splitStrByWidth(d.data.name, getFMLabelWidth())
                    };
                });
        }
    })

    //tree setting
    var tree = d3.tree()
        .nodeSize([getFMNodeHeight(), getFMNodeWidth()]);
    // create tree layout
    tree(fmroot);
    // draw tree
    drawFMTree(fmroot);
}

function getFMNodeHeight() {
    return 15;
}
function getFMNodeWidth() {
    return 150;
}
function getFMLabelWidth() {
    return getFMNodeWidth() - 20;
}

function drawFMTree(fmroot) {
    // svg initialize
    d3.select("#FMTreeSVG").select("svg").remove();

    var zoom = d3.zoom()
        .scaleExtent([.2, 10])
        // .translateExtent(
        // [[$("#FMTreeSVG").height() * -2, $("#FMTreeSVG").width() * -2],
        // [$("#FMTreeSVG").height() * 2, $("#FMTreeSVG").width() * 2]])
        .on("zoom", zoomed);
    function zoomed() {
        d3.select("#FMTreeSVG .treeContainer")
            .attr("transform", d3.event.transform);
    }
    // treeを入れるコンテナを作成
    var svg = d3.select("#FMTreeSVG")
        .attr("width", "100%")
        .attr("height", "100%")
        .call(zoom);
    svg.append("g")
        .attr("class", "treeContainer");

    // ノード間を線でつなぐ
    d3.select("#FMTreeSVG .treeContainer").selectAll(".link")
        .data(fmroot.descendants().slice(1))
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", [2, 1])
        .attr("stroke", "gray")
        .attr("d", function (d) {
            return "M" + d.y + "," + d.x
                + "C" + (d.y + d.parent.y) / 2 + "," + d.x
                + " " + (d.y + d.parent.y) / 2 + "," + d.parent.x
                + " " + d.parent.y + "," + d.parent.x;
        });

    // ノード作成
    var node = d3.select("#FMTreeSVG .treeContainer")
        .selectAll(".node")
        .data(fmroot.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", function (d) {
            return "translate(" + d.y + "," + d.x + ")";
        });
    node.append("circle")
        .attr("r", 4)
        .attr("fill", function (d) {
            if (d.data.fmcat == "func") {
                return "red";
            } else {
                return "teal";
            }
        });
    node.append("text")
        .html(function(d){return tspanStringify(d.label);})
        .attr("font-size", getFMNodeHeight());

    console.log(fmroot);

    // 画面サイズに合わせてツリーをオフセット&スケール
    var _is_block = true;
    if ($("#FM-tree").css("display") == "none") {
        _is_block = false;
        $("#FM-tree").css("display", "block");
    }
    var bbox = $("#FMTreeSVG .treeContainer")[0].getBBox();
    var k = $("#FM-tree").height() / bbox.height * 0.85;
    k = k > 10 ? 10 : k;
    svg.call(zoom.transform, d3.zoomIdentity
        .translate(50, 10)
        .scale(k));
    if (_is_block == false) {
        $("#FM-tree").css("display", "none");
    }
}

// sidenavのnode editerを空にする
function clearEditer() {
    d3.select("#func-edit")
        .style("display", "none");
    d3.select("#comp-edit")
        .style("display", "none");
}

// create dictionary of new component node
function makeNewComp(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["func"] = [];
    dic["param"] = [];
    dic["children"] = [];
    dic["note"] = [];
    return dic;
}

// create dictionary of new function node
function makeNewFunc(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["parents"] = [];
    dic["note"] = [];
    return dic;
}

// create dictionary of new parameter node
function makeNewParam(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["parents"] = [];
    dic["note"] = [];
    return dic;
}

// get json-pointer of the node
function getJptr(node, ptr = "") {
    if (node.parent === null) {
        return ptr;
    } else {
        var _ref = node.parent.children.indexOf(node);
        var _ptr = ptr === "" ? "" : ptr;
        return getJptr(node.parent, "/children/" + _ref + _ptr);
    }
}

// delete json pointer
function delJptr(node, jptr) {
    var argIndex = jptr.match(/\d+$/)[0];  // indexを切り出し
    var jptrLeft = jptr.slice(0, -argIndex.length);
    var re = RegExp("^" + jptrLeft)
    var _del = function (ptr, i, arr) {
        if (!re.test(ptr)) { return; }
        // 引数のjptrと、data中のjptrのindexを比較
        var _right = ptr.split(re)[1];
        var jptrIndex = _right.match(/^\d+/)[0];  // each要素のindex
        var jptrRight = _right.split(/^\d+/)[1];  // each要素のindex以降のjptr文字列
        if (jptrIndex == argIndex) {
            arr.splice(i, 1);
        }
        // 削除したindexより後の要素を繰り上げ
        if (Number(jptrIndex) > Number(argIndex)) {
            var newNum = Number(jptrIndex) - 1;
            arr[i] = jptrLeft + String(newNum) + jptrRight;
        }
    }
    node.descendants().forEach(function (d) {
        d.data.func.forEach(function (f) {
            f.parents.forEach(_del)
        })
        d.data.param.forEach(function (p) {
            p.parents.forEach(_del)
        })
    });
}
// swap json pointer
function swapJptr(node, oldJptr, newJptr) {
    var oldRe = RegExp("^" + oldJptr);
    var newRe = RegExp("^" + newJptr);
    var _replace = function (str) {
        var replaced = str.replace(oldRe, newJptr);
        if (replaced != str) {
            return replaced;
        }
        else {
            replaced = str.replace(newRe, oldJptr);
            if (replaced != str) {
                return replaced;
            } else {
                return false;
            }
        }
    }
    node.descendants().forEach(function (d) {
        // swap func-parent json pointer
        d.data.func.forEach(function (f) {
            f.parents.forEach(function (ptr, i, arr) {
                var replaced = _replace(ptr);
                if (replaced != false) {
                    arr[i] = replaced;
                }
            })
        })
        // swap param-parent json pointer
        d.data.param.forEach(function (p) {
            p.parents.forEach(function (ptr, i, arr) {
                var replaced = _replace(ptr);
                if (replaced != false) {
                    arr[i] = replaced;
                }
            })
        })
    });
}

// HSLa文字列を自動生成
function randHSLa(h = [0, 360], s = [0, 100], l = [0, 100], a = [0, 1]) {
    var chk = function (arr, min, max) {
        if (arr[1] - arr[0] < 0) {
            throw new RangeError("reverse order");
        }
        if (arr[0] < min) {
            throw new RangeError("too small argument");
        }
        if (arr[1] > max) {
            throw new RangeError("too large argument");
        }
    }
    chk(h, 0, 360);
    chk(s, 0, 100);
    chk(l, 0, 100);
    chk(a, 0, 1);
    var rand = function (arr) { return Math.random() * (arr[1] - arr[0] + 1) + arr[0] };
    return "hsla(" + rand(h) + "," + rand(s) + "%," + rand(l) + "%, " + rand(a) + ")";
}

// 文字列幅測定
function getStrWidth(str) {
    var e = $("#ruler");
    var width = e.text(str).get(0).offsetWidth;
    e.empty();
    return width;
}

// 文字列を指定した幅で区切って配列で返す
function splitStrByWidth(str, width) {
    if (getStrWidth(str) <= width) {
        return Array(str);
    } else {
        var arr = Array();
        var index = 0;
        for (var i = 0; i < str.length; i++) {
            if (getStrWidth(str.substring(index, i)) > width) {
                arr.push(str.substring(index, i - 1));
                index = i - 1;
            }
        }
        arr.push(str.slice(index));
        return arr;
    }
}

// set edit pane
// arg: str type: "comp", "func", "param"
// if argument is not given, edit pane is cleared.
function setEditPane(type = undefined) {
    if (type === "comp") {
        d3.select("#comp-edit")
            .style("display", "block");
    } else {
        d3.select("#comp-edit")
            .style("display", "none");
    }
    if (type === "func") {
        d3.select("#func-edit")
            .style("display", "block");
    } else {
        d3.select("#func-edit")
            .style("display", "none");
    }
    if (type === "param") {
        d3.select("#param-edit")
            .style("display", "block");
    } else {
        d3.select("#param-edit")
            .style("display", "none");
    }
}

// confirm before delete node
function confirmDelNode(name, f) {
    $("#modal-remove-confirm .modal-content h4")
        .text('Are you sure you want to delete "' + name + '"');
    $("#modal-remove-confirm").modal("open");
    d3.select("#modal-remove-confirm a")
        .on("click", f)
}