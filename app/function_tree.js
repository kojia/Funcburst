// @licence MIT

// Tree Model Object
function TreeModel() {

    this.data = makeNewComp("Root");
    this.category = Object();
    this.root = Object();
    this.fmroot = Object();

    p = TreeModel.prototype;

    // set json data
    p.setData = function (json = undefined) {
        if (json) {
            this.data = json["data"];
            this.category = json["category"];
        }
        else {
            this.data = makeNewComp("Root");
            this.category = Object();
        }
    }

    // stringify json
    p.stringifyJson = function () {
        var json = { "data": this.data, "category": this.category };
        return JSON.stringify(json, undefined, 2);
    }

    // hierararchlize Component Tree Model and set layout
    p.makeCompTreeModel = function () {
        this.root = d3.hierarchy(this.data, function (d) {
            return d["children"];
        });
        this.root.eachAfter(function (node) {
            // set array for component-node label which width adjusted by node width
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
            // set node.value (evaluate node width including comp, func, and param)
            var thisWidth = 1;
            thisWidth += node.label.length
                + node.func.reduce(function (a, b) {
                    return a + b.label.length;
                }, 0)
                + node.param.reduce(function (a, b) {
                    return a + b.label.length;
                }, 0);
            var childWidth = 0;
            if (node.children) {
                childWidth = node.children.reduce(function (a, b) {
                    return a + b.value;
                }, 0);
            }
            if (thisWidth > childWidth) {
                node.value = thisWidth;
            } else {
                node.value = childWidth;
            }
        });

        // func node のarrayを返す関数
        this.root.funcDescendants = function () {
            return this.descendants()
                .reduce(function (a, b) { return a.concat(b.func); }, Array());
        };
        // func node の親子ペアのリストを返す
        this.root.funcParentChild = function () {
            return this.funcDescendants()
                .filter(function (elm) { return elm.parents.length; })
                .map(function (elm) {
                    return elm.parents.map(function (prnt) {
                        return { "x": elm.x, "y": elm.y, "parent": prnt }
                    })
                })
                .reduce(function (a, b) { return a.concat(b); }, Array());
        }

        // param-node のarrayを返す関数
        this.root.paramDescendants = function () {
            return this.descendants()
                .reduce(function (a, b) { return a.concat(b.param); }, Array());
        }
        // param-node を子に持つペアのリストを返す
        this.root.paramParentChild = function () {
            return this.paramDescendants()
                .filter(function (elm) { return elm.parents.length; })
                .map(function (elm) {
                    return elm.parents.map(function (prnt) {
                        return { "x": elm.x, "y": elm.y, "parent": prnt }
                    })
                })
                .reduce(function (a, b) { return a.concat(b); }, Array());
        }

        // create tree layout
        var tree = d3.tree()
            // .size([$(window).height() - $("#top-nav").height(), $("#compTreeSVG").width() * 0.9])
            .nodeSize([getNodeHeight(), getNodeWidth()])
            .separation(separate(function (node) {
                return node.func.concat(node.param);
            }));
        tree(this.root);
        // labelの並列方向単位長
        var kx = getNodeHeight();
        // func-, param-nodeの親子関係リンク挿入とfunc-, param-nodeの表示位置計算
        var root = this.root
        this.root.each(function (node) {
            var lineOffset = node.label.length;  // x座標オフセット量
            node.func.forEach(function (funcElm, i, funcArr) {
                funcArr[i].x = node.x + kx * lineOffset;
                funcArr[i].y = node.y + kx / 2;
                // オフセット量加算
                lineOffset += funcElm.label.length;
                // set parent for each func-node
                funcArr[i].parents = funcElm.data.parents.map(function (p) {
                    var _r = parseJptr(root, p);
                    if (_r === undefined) {
                        console.log(p + " is invalid json pointer");
                        return;
                    }
                    return _r;
                });
                // add children of each func-node
                funcArr[i].parents.forEach(function (funcPrnt) {
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
                    var _r = parseJptr(root, p);
                    if (_r === undefined) {
                        console.log(p + " is invalid json pointer");
                        return;
                    }
                    return _r;
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
    }

    // hierarchlize Function-Means Tree Model and set layout
    p.makeFMTreeModel = function () {
        // make object based by function means model hierarchy
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
                        return child.isb !== undefined;
                    })
                    .map(function (childfunc) {
                        return {
                            "fmcat": "func",
                            "node": childfunc,
                            "children": [{
                                "fmcat": "means",
                                "node": childfunc.isb,
                                "children": setFMchild(childfunc),
                                "param": childfunc.children == undefined ? [] :
                                    childfunc.children.filter(function (e) {
                                        return e.isb === undefined;
                                    })
                            }]
                        }
                    })
            }
        }
        this.root.func.forEach(function (fnode) {
            fmData.children.push({
                "fmcat": "func",
                "node": fnode,
                "children": [{
                    "fmcat": "means",
                    "node": this.root,
                    "children": setFMchild(fnode),
                    "param": fnode.children == undefined ? [] :
                        fnode.children.filter(function (e) {
                            return e.isb === undefined;
                        })
                }]
            })
        }, this);

        // compute hierarchy for function means tree
        this.fmroot = d3.hierarchy(fmData, function (d) {
            return d["children"];
        })

        // set label, node, and data
        this.fmroot.eachBefore(function (fmnode) {
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
            .nodeSize([getFMNodeHeight(), getFMNodeWidth()])
            .separation(separate(function (node) {
                return node.param === undefined ? [] : node.param;
            }));
        // create tree layout
        tree(this.fmroot);
        // set coordinate of param node
        var kx = getNodeHeight(); // labelの並列方向単位長
        this.fmroot.each(function (node) {
            if (node.data.fmcat != "means") return;
            var lineOffset = node.label.length;
            node.param.forEach(function (p, i, arr) {
                arr[i].x = node.x + kx * lineOffset;
                arr[i].y = node.y - getFMNodeWidth() / 4;
                lineOffset += p.label.length;
            })
        });
    }

    // hierarchlize Funcburst Model
    p.makeFuncburstModel = function () {
        var partition = d3.partition();
        partition(this.root);

        var radian = d3.scaleLinear()
            .range([0, 2 * Math.PI]);

        // lays out each node onto the funcburst.
        var dx = 1 / this.root.value;
        var dy = 1 / (this.root.height + 1);
        this.root.descendants().forEach(function (node) {
            var funcAndParam = node.func.concat(node.param);
            var space = dx * node.value / (funcAndParam.length);
            // func/param-node radius
            var radius = (node.depth + 0.5) * dy;  // node circle center
            var radiusInner = (node.depth + 0.4) * dy;  // for link start point
            var radiusOuter = (node.depth + 0.6) * dy;  // for link end point

            // y coordinates of parent's func/param-node
            var prntFpY = Array();
            if (node.parent) {
                prntFpY = node.parent.func.concat(node.parent.param)
                    .map(function (prntFp) {
                        return prntFp.yfb;
                    });
            }

            funcAndParam.forEach(function (fpNode, i) {
                fpNode.x0 = node.x0 + (i + 0.5) * space;
                fpNode.y0 = radius;

                // angle index
                var a = [0, 0.5, 1]
                    .map(function (_a) {
                        return node.x0 + (i + _a) * space;
                    });
                // y = [yMin, yCtr, yMax]
                var y = a.map(function (_a) {
                    return radius * Math.cos(radian(_a)) * -1;
                }).sort(function (_a, _b) { return _a - _b; });
                // scan parent's minimum y coordinate and replace y[0]
                prntFpY.filter(
                    function (value) {
                        return value > y[0] && value < y[1];
                    })
                    .filter(function (val, i, arr) {
                        return val == Math.max.apply(null, arr);
                    })
                    .forEach(function (d) {
                        y[0] = d;
                    });
                // scan parent's maximum y coordinate and replace y[2]
                prntFpY
                    .filter(function (value) {
                        return value > y[1] && value < y[2];
                    })
                    .filter(function (val, i, arr) {
                        return val == Math.min.apply(null, arr);
                    })
                    .forEach(function (d) {
                        y[2] = d;
                    });
                // set func/param-node x,y coordinate: xfb and yfb
                fpNode.yfb = (y[0] + y[2]) / 2;
                var angle = Math.asin(fpNode.yfb / radius);
                if (a[1] > 0.5) { angle = Math.PI - angle; }
                fpNode.xfb = radius * Math.cos(angle);
                fpNode.xfbS = radiusInner * Math.cos(angle);
                fpNode.yfbS = radiusInner * Math.sin(angle);
                fpNode.xfbE = radiusOuter * Math.cos(angle);
                fpNode.yfbE = radiusOuter * Math.sin(angle);
                fpNode.anglefb = angle;
            });
        });

    }
}

// Tree View Interface
var ITree = function (selector) {
    this.svg = d3.select(selector);
    this.zoomer = this.setZoom();
};
(function () {
    p = ITree.prototype;
    p.isActiveSVG = function () {
        if (this.svg.style("display") == "none") {
            return false;
        }
        return true;
    };
    p.drawSVG = function (model, selectJptr = undefined) { };
    p.setZoom = function () {
        var zoomed = function (svg) {
            return function () {
                svg.select(".treeContainer")
                    .attr("transform", d3.event.transform);
            }
        }
        var zoomer = d3.zoom()
            .scaleExtent([.2, 10])
            // .translateExtent(
            // [[$("#compTreeSVG").width() * -2, $("#compTreeSVG").height() * -2],
            // [$("#compTreeSVG").width() * 2, $("#compTreeSVG").height() * 2]])
            .on("zoom", zoomed(this.svg));
        this.svg
            .attr("width", "100%")
            .attr("height", "100%")
            .call(zoomer);

        return zoomer;
    }
    // fit drawing to the SVG field by offset and scale adjustment
    p.fit = function (xOffset = undefined) {
        var _is_block = true;
        if (this.svg.style("display") == "none") {
            _is_block = false;
            this.svg.style("display", "block");
        }
        var bbox = this.svg.select(".treeContainer").node().getBBox();
        var ky = parseInt(this.svg.style("height")) / bbox.height * 0.9;
        var kx = parseInt(this.svg.style("width")) / bbox.width * 0.9;
        var k = ky > kx ? kx : ky;
        var ty = bbox.height / 2 * k;
        var tx = 10;
        if (xOffset) {
            tx += bbox.width / 2 * k;
        }
        this.svg.call(this.zoomer.transform, d3.zoomIdentity
            .translate(tx, ty + 2 * getNodeHeight())
            .scale(k));
        if (_is_block == false) {
            this.svg.style("display", "none");
        }
    };

    p.drawSvgOnNewWindow = function () {
        var cloneSvg = $(this.svg.node()).clone(false);
        cloneSvg.find(".treeContainer")
            .attr("transform", null);
        var nw = window.open();

        function svgLoad() {
            if (nw && nw.document && nw.document.body) {
                var div = nw.document.createElement("div");
                div.innerHTML = cloneSvg.html();
                nw.document.body.appendChild(div);
                var bbox = nw.document.getElementsByClassName("treeContainer")[0].getBBox();
                nw.document.body.removeChild(div);

                cloneSvg.children("svg")
                    .attr({
                        "xmlns": "http://www.w3.org/2000/svg",
                        "xmlns:xlink": "http://www.w3.org/1999/xlink",
                        // "width": bbox.width,
                        // "height": bbox.height
                    });
                cloneSvg.children("svg")[0].setAttribute(
                    "viewBox", bbox.x + ", " + bbox.y + ", "
                    + bbox.width + ", " + bbox.height
                );
                var src = "data:image/svg+xml;charset=utf-8,";
                src += encodeURIComponent(cloneSvg.html());
                var img = document.createElement("img");
                img.setAttribute("src", src)
                nw.document.body.appendChild(img);
            }
            else {
                window.setTimeout(function () { svgLoad(); }, 100);
            }
        }
        svgLoad();
    }
}())

// View Object for Component Tree
var ComponentTree = function () {
    ITree.call(this, "#comp-tree");

    // geranerate SVG field
    this.drawSVG = function (model, selectJptr = undefined) {
        var self = this;
        // func-nodeをSVG描画
        // func-nodeをつなぐ線の色を設定
        var xArray = model.root.funcDescendants()
            .map(function (node) {
                return node.x;
            })
        var xMin = Math.min.apply(null, xArray);
        var xMax = Math.max.apply(null, xArray);
        var getLinkColor = function (x) {
            var h = 350 * (x - xMin) / (xMax - xMin);
            return "hsla(" + h + ",100%,60%,1)";
        };
        // ノード間を線でつなぐ
        drawLink(model.root.descendants().slice(1), "comp");
        drawLink(model.root.funcParentChild(), "func");
        drawLink(model.root.paramParentChild(), "param");
        function drawLink(nodeArr, type) {
            var className = type + "Link";
            var strokeWidth = { "comp": 2.5, "func": 1, "param": 1 };
            var strokeDasharray = { "comp": [2, 1], "func": undefined, "param": undefined };
            var strokeColor = {
                "comp": "gray",
                "func": function (d) { return getLinkColor(d.x); },
                "param": function (d) { return getLinkColor(d.x); }
            };
            var curve = { "comp": 2, "func": 1.8, "param": 1.8 }

            var link = d3.select("#compTreeSVG .treeContainer .link")
                .selectAll("." + className)
                .data(nodeArr);
            link.exit().remove();
            var enteredLink = link.enter()
                .append("path");
            enteredLink.merge(link)
                .attr("class", className)
                .attr("fill", "none")
                .attr("stroke-width", strokeWidth[type])
                .attr("stroke-dasharray", strokeDasharray[type])
                .attr("stroke", strokeColor[type])
                .attr("d", function (d) {
                    if (Math.abs(d.y - d.parent.y) < getNodeWidth()) { // 同じdepthの場合
                        return "M" + d.y + "," + d.x
                            + "C" + (d.y - getNodeHeight() * 2) + "," + (d.x + d.parent.x) / 2
                            + " " + (d.y + getNodeHeight() * 2) + "," + d.parent.x
                            + " " + d.parent.y + "," + d.parent.x;
                    } else {
                        return "M" + d.y + "," + d.x
                            + "C" + (d.y + d.parent.y) / curve[type] + "," + d.x
                            + " " + (d.y + d.parent.y) / curve[type] + "," + d.parent.x
                            + " " + d.parent.y + "," + d.parent.x;
                    }
                });
        }

        // ノード作成
        var drawNode = function (nodeArr, type, root) {
            var className = type + "Node";
            var node = d3.select("#compTreeSVG .treeContainer .node")
                .selectAll("." + className)
                .data(nodeArr);
            node.exit().remove();
            var enteredNode = node.enter()
                .append("g").attr("class", className);
            enteredNode.append("g").attr("class", "selected");
            enteredNode.append("circle");
            enteredNode.append("text");
            var updatedNode = enteredNode.merge(node);
            // ノードに円とテキストを表示
            updatedNode
                .attr("transform", function (d) {
                    return "translate(" + d.y + "," + d.x + ")";
                });
            updatedNode.select("text").html(function (d) { return tspanStringify(d.label) });
            updatedNode.on("click", function (d) {
                d3.select(this).call(fillSelectedNode, self.svg);
                trees.editor.setNode(d);
                trees.editor.generatePane();
            });
            updatedNode.call(styleNode);
            updatedNode
                .filter(function (d) {
                    return getJptr(d) == selectJptr;
                })
                .dispatch("click");
        }
        // clear select
        self.svg.selectAll(".selected-fill").remove();
        // draw node
        drawNode(model.root.descendants(), "comp", model.root);
        drawNode(model.root.funcDescendants(), "func", model.root);
        drawNode(model.root.paramDescendants(), "param", model.root);
    };
}
// inherit
ComponentTree.prototype = Object.create(ITree.prototype);
ComponentTree.prototype.constructor = ComponentTree;

// View Object for Function Means Tree
var FMTree = function () {
    ITree.call(this, "#FM-tree");

    // geranerate SVG field
    this.drawSVG = function (model) {

        // ノード間を線でつなぐ
        var link = this.svg.select(".treeContainer").selectAll(".link")
            .data(model.fmroot.descendants().slice(1));
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

        // ノード作成(component and function)
        var node = this.svg.select(".treeContainer")
            .selectAll("g")
            .data(model.fmroot.descendants());
        node.exit().remove();
        var enteredNode = node.enter()
            .append("g");
        enteredNode.append("circle");
        enteredNode.append("text")
            .attr("font-size", getFMNodeHeight() + "px");
        var updatedNode = enteredNode.merge(node);
        updatedNode
            .attr("class", function (d) {
                if (d.data.fmcat == "func") {
                    return "funcNode";
                } else {
                    return "compNode";
                }
            })
            .attr("transform", function (d) {
                return "translate(" + d.y + "," + d.x + ")";
            });
        updatedNode.select("circle");
        updatedNode.select("text")
            .html(function (d) { return tspanStringify(d.label); });
        this.svg.selectAll(".compNode").call(styleNode);
        this.svg.selectAll(".funcNode").call(styleNode);
        // draw parameter node 
        var paramData = model.fmroot.descendants()
            .filter(function (d) { return d.data.fmcat === "means" })
            .reduce(function (a, b) { return a.concat(b.param); }, Array());
        var param = this.svg.select(".treeContainer")
            .selectAll(".paramNode")
            .data(paramData);
        param.exit().remove();
        var enteredParam = param.enter()
            .append("g");
        enteredParam.append("circle");
        enteredParam.append("text");
        var updatedParam = enteredParam.merge(param);
        updatedParam.attr("class", "paramNode")
            .attr("transform", function (d) {
                return "translate(" + d.y + "," + d.x + ")";
            });
        updatedParam.select("text")
            .html(function (d) { return tspanStringify(d.label); });
        updatedParam.call(styleNode);
    }
}
// inherit
FMTree.prototype = Object.create(ITree.prototype);
FMTree.prototype.constructor = FMTree;

// View Object for Funcburst
var Funcburst = function () {
    ITree.call(this, "#funcburst");

    // draw funcburst SVG
    this.drawSVG = function (model, selectJptr = undefined) {
        var _svg = this.svg;
        var radius = 300;
        var color = d3.scaleOrdinal(d3.schemeCategory20);

        var theta = d3.scaleLinear()
            .range([0, 2 * Math.PI]);

        var r = d3.scaleLinear()
            .range([0, radius]);

        var cellArc = d3.arc()
            .startAngle(function (d) { return Math.max(0, Math.min(2 * Math.PI, theta(d.x0))); })
            .endAngle(function (d) {
                if (d.x0 == 0 && d.x1 == 1) {
                    return 2 * Math.PI;
                }
                return theta(d.x1) - 0.02;
            })
            .innerRadius(function (d) { return Math.max(0, r(d.y0)); })
            .outerRadius(function (d) {
                return r(d.y1 - 0.01);
            });

        // clear select
        _svg.selectAll(".selected-fill").remove();

        // draw sunburst
        var cell = this.svg.select(".cell").selectAll(".cellnode")
            .data(model.root.descendants());
        cell.exit().remove();
        var enteredCell = cell.enter().append("g").attr("class", "cellnode");
        enteredCell.append("path");
        var updatedCell = enteredCell.merge(cell)
        updatedCell.select("path")
            .attr("d", cellArc)
            .style("fill", function (d) {
                if (d.data.cat) {
                    var colname = getCatColor(model.category, d.data.cat, "comp");
                    if (document.getElementById("dotPtn" + colname.slice(1)) === null) {
                        _svg.select("defs")
                            .append("pattern")
                            .attr("id", "dotPtn" + colname.slice(1))
                            .attr("width", "6").attr("height", "6")
                            .attr("x", "3").attr("y", "3")
                            .attr("patternUnits", "userSpaceOnUse")
                            .each(function (d, i) {
                                d3.select(this).append("rect")
                                    .attr("width", "6").attr("height", "6")
                                    .attr("fill", "gray");
                                d3.select(this).append("circle")
                                    .attr("cx", "3").attr("cy", "3")
                                    .attr("r", "1").attr("fill", colname);
                            });
                    }
                    return "url(#dotPtn" + colname.slice(1) + ")";
                }
                else {
                    return "gray";
                }
            });
        updatedCell.on("click", function (d, i, a) {
            _svg.selectAll(".selected-fill").remove();
            var attr = d3.select(this).select("path").node().attributes;
            var to = d3.select(this).append("path");
            Object.keys(attr).forEach(function (key) {
                to.attr(attr[key].name, attr[key].value);
            });
            to.attr("class", "selected-fill")
                .style("fill", "#64ffda")
                .style("fill-opacity", 0.3);
            trees.editor.setNode(d);
            trees.editor.generatePane();
        });
        updatedCell.filter(function (d) { return getJptr(d) == selectJptr; })
            .dispatch("click");

        // draw Labels for Component on each sunburst cell
        // define curve path, based on which the label is drawn
        var lblBase = this.svg.select("defs").selectAll(".compLabelBase")
            .data(model.root.descendants());
        lblBase.exit().remove();
        var enteredlblBase = lblBase.enter()
            .append("path");
        enteredlblBase.merge(lblBase)
            .attr("class", "compLabelBase")
            .attr("id", function (d, i) {
                return "lblBase" + i;
            })
            .attr("d", function (d, i) {
                var _r = r(d.y0) + (r(d.y1) - r(d.y0)) * 0.15;
                var _startTheta = theta(d.x0);
                var _endTheta = theta(d.x1);
                if (i == 0) {
                    _r = r(d.y1);
                    return "M" + (_r * -1) + " 0 H" + _r;
                }
                if (_startTheta == 0 && _endTheta == 2 * Math.PI) {
                    _startTheta = Math.PI / 2;
                    _endTheta = Math.PI * 3 / 2;
                }
                // label with PI/2 < angle < 3PI/2 is flipped vertically
                var aveTheta = (_startTheta + _endTheta) / 2
                if (aveTheta > Math.PI / 2 && aveTheta < Math.PI * 3 / 2) {
                    var mx = _r * Math.sin(_endTheta);
                    var my = _r * Math.cos(_endTheta) * -1;
                    var sweep = 0;
                    var ax = _r * Math.sin(_startTheta);
                    var ay = _r * Math.cos(_startTheta) * -1;
                } else {
                    var mx = _r * Math.sin(_startTheta);
                    var my = _r * Math.cos(_startTheta) * -1;
                    var sweep = 1;
                    var ax = _r * Math.sin(_endTheta);
                    var ay = _r * Math.cos(_endTheta) * -1;
                }
                return "M" + mx + " " + my + "A" + _r + " " + _r + ", 0, 0, "
                    + sweep + "," + ax + " " + ay;
            });
        // draw label to component cell
        var compLabel = this.svg.select(".cLabel").selectAll("text")
            .data(model.root.descendants());
        compLabel.exit().remove();
        var enteredCompLabel = compLabel.enter()
            .append("text");
        enteredCompLabel.append("textPath");
        enteredCompLabel.merge(compLabel)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("fill", "white")
            .select("textPath")
            .attr("xlink:href", function (d, i) {
                return "#lblBase" + i;
            })
            .attr("startOffset", "50%")
            .text(function (d) { return d.data.name; });

        // draw link between func/param-nodes
        var linkPairs = model.root.funcDescendants()
            .concat(model.root.paramDescendants())
            .map(function (child) {
                return child.parents.map(function (parent) {
                    return { "c": child, "p": parent };
                })
            })
            .reduce(function (a, b) {
                return a.concat(b);
            }, Array());
        var fpLink = this.svg.select(".fpLink").selectAll(".fpLinkPath")
            .data(linkPairs);
        fpLink.exit().remove();
        var enteredFpLink = fpLink.enter()
            .append("g")
            .attr("class", "fpLinkPath");
        enteredFpLink.append("path").attr("class", "start");
        enteredFpLink.append("path").attr("class", "link");
        enteredFpLink.append("path").attr("class", "end");
        var updatedFpLink = enteredFpLink.merge(fpLink);
        updatedFpLink.select(".link")
            .attr("stroke", function (d) {
                var _x = 0, _y = 0;
                if (d.c.xfbS > d.p.xfbE) { _x = 1; }
                if (d.c.yfbS > d.p.yfbE) { _y = 1; }
                return "url(#rg" + String(_x) + String(_y) + ")";

            })
            .attr("fill", "none")
            .attr("d", function (d) {
                var sx = radius * d.c.xfbS;
                var sy = radius * d.c.yfbS;
                var ex = radius * d.p.xfbE;
                var ey = radius * d.p.yfbE;
                var q1x = sx - 0.2 * radius * Math.cos(d.c.anglefb);
                var q1y = sy - 0.2 * radius * Math.sin(d.c.anglefb);
                var q2x = ex + 0.2 * radius * Math.cos(d.p.anglefb);
                var q2y = ey + 0.2 * radius * Math.sin(d.p.anglefb);;
                return "M" + sx + "," + sy + " C" + q1x + "," + q1y + "," + q2x + "," + q2y
                    + "," + ex + "," + ey;
            });
        updatedFpLink.select(".start")
            .attr("stroke", "cyan").attr("fill", "none")
            .attr("d", function (d) {
                return "M" + radius * d.c.xfb + "," + radius * d.c.yfb
                    + " L" + radius * d.c.xfbS + "," + radius * d.c.yfbS;
            });
        updatedFpLink.select(".end")
            .attr("stroke", "#ffff1a").attr("fill", "none")
            .attr("d", function (d) {
                return "M" + radius * d.p.xfbE + "," + radius * d.p.yfbE
                    + " L" + radius * d.p.xfb + "," + radius * d.p.yfb;
            });
        updatedFpLink.selectAll("path")
            .attr("stroke-linecap", "round");

        // draw func- and param-node
        var fpLabel = this.svg.select(".fpLabel").selectAll("g .label")
            .data(model.root.funcDescendants().concat(model.root.paramDescendants()));
        fpLabel.exit().remove();
        var enteredFpLabel = fpLabel.enter()
            .append("g").attr("class", "label");
        enteredFpLabel.append("g").attr("class", "selected");
        enteredFpLabel.append("circle");
        enteredFpLabel.append("text");
        var updatedFpLabel = enteredFpLabel.merge(fpLabel)
            .attr("transform", function (d) {
                return "translate(" + radius * d.xfb + "," + radius * d.yfb + ")";
            });
        updatedFpLabel.select("circle")
            .attr("r", 4)
            .attr("fill", function (d) {
                if (d.isb == undefined) {
                    return "orange";  // parameter
                } else {
                    return "red";  // function
                }
            })
            .attr("stroke", "white");
        updatedFpLabel.select("text")
            .attr("text-anchor", function (d) {
                if (d.xfb < 0) {
                    return "end";
                }
            })
            .attr("stroke", function (d) {
                if (d.isb) {
                    var type = "func";
                } else {
                    var type = "param";
                }
                if (d.data.cat) {
                    return getCatColor(model.category, d.data.cat, type)
                }
            })
            .attr("paint-order", "stroke")
            .attr("stroke-width", "1.0px")
            .text(function (d) {
                return d.data.name;
            });

        // fill element of selected node
        updatedFpLabel.on("click", function (d) {
            d3.select(this).call(fillSelectedNode, _svg);
            trees.editor.setNode(d);
            trees.editor.generatePane();
        });
        updatedFpLabel
            .filter(function (d) {
                return getJptr(d) == selectJptr;
            })
            .dispatch("click");
    }

    this.fit = function () {
        ITree.prototype.fit.call(this, xOffset = true);
    }
}
// inherit
Funcburst.prototype = Object.create(ITree.prototype);
Funcburst.prototype.constructor = Funcburst;

// node editor
var NodeEditor = function (controller) {
    this.controller = controller;
    this.modelroot = controller.model.root;
    this.node = undefined;
    this.d3root = undefined;
    this.type = undefined;
    // set node
    this.setNode = function (node) {
        console.log(node);
        this.node = node;
        this.modelroot = controller.model.root;
        if (node.isb) {
            this.type = "func";
            this.d3root = d3.select("#func-edit");
        } else if (node.icb) {
            this.type = "param";
            this.d3root = d3.select("#param-edit");
        } else {
            this.type = "comp";
            this.d3root = d3.select("#comp-edit");
        }
    }
    // specific collection generator
    this.addNameCollection = function () {
        var title = "";
        if (this.type == "func") { title = "Function Name"; }
        else if (this.type == "param") { title = "Parameter Name"; }
        else { title = "Component Name"; }
        var self = this;
        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header");
        collection.append("li").attr("class", "collection-header")
            .append("h6")
            .text(title);
        collection.append("li").attr("class", "collection-item")
            .append("form").attr("onsubmit", "return false;")
            .append("input")
            .attr("value", self.node.data.name)
            .on("change", function () {
                self.node.data.name = d3.event.target.value;
                self.controller.reload(selectJptr = getJptr(self.node));
            });
    }
    this.addCategoryCollection = function () {
        var self = this;
        var category = self.controller.model.category
        var categoryList = ["uncategolized"];
        if (category[this.type]) {
            categoryList = categoryList.concat(category[this.type]);
        }
        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header")
            .style("overflow", "visible");
        collection.append("li").attr("class", "collection-header")
            .append("h6").text("Category")
            .append("span").attr("class", "btn-edit-cat secondary-content")
            .append("i").attr("class", "material-icons").text("list");
        collection.append("li").attr("class", "collection-item")
            .append("div").attr("class", "input-field")
            .append("select")
            .selectAll("option").data(categoryList)
            .enter().append("option")
            .attr("value", function (d) { return categoryList.indexOf(d); })
            .text(function (d) { return d; });
        // set category already set on the selected node
        collection.select("select").property("value", function () {
            return categoryList.indexOf(self.node.data.cat);
        });
        // change category
        $(collection.select("select").node()).off("change");
        $(collection.select("select").node()).on("change", function () {
            var _selectValue = collection.select("select").property("value")
            if (_selectValue != 0) {
                self.node.data.cat = categoryList[_selectValue];
            } else {
                self.node.data.cat = "";
            }
            self.controller.reload(selectJptr = getJptr(self.node));
        });
        // update materialize select forms
        $("select").material_select();
        // category edit button
        collection.select(".btn-edit-cat")
            .on("click", function () {
                $("#modal-category").modal("open");
                updateCatSettings(category, function () {
                    self.regenerate();
                });
            })
    }

    this.addParentCollection = function () {
        var self = this;
        var prnts = [];  // list of parent candidate
        var thisNodeJptrRe = RegExp("^" + getJptr(this.node));
        this.modelroot.eachBefore(function (node) {
            // skip this node
            if (getJptr(node).match(thisNodeJptrRe)) { return; }
            prnts.push(node);
        });

        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header");
        collection.append("li").attr("class", "collection-header")
            .append("h6").text("Parent")
            .append("span").attr("class", "btn-change-comp-parent secondary-content")
            .append("i").attr("class", "material-icons").text("swap_horiz");
        collection.append("li").attr("class", "collection-item")
            .text(function (d) {
                return self.node.parent ? self.node.parent.data.name : "no parent";
            });

        // parents change nav
        d3.select("#nav-change-comp-parent .collection-header")
            .text('Select Parent of "' + self.node.data.name + '"');
        var navItems = d3.select("#nav-change-comp-parent")
            .selectAll("a.collection-item")
            .data(prnts);
        navItems.exit().remove();
        var enteredNavItems = navItems.enter()
            .append("a")
            .attr("href", "#!")
            .attr("class", "collection-item");
        enteredNavItems.append("div");
        var margedNavItems = enteredNavItems.merge(navItems);
        margedNavItems
            .classed("disabled", function (d) {
                return d == self.node.parent ? true : false;
            })
            .style("color", function (d) {
                if (this.getAttribute("class").match(/disabled/)) { return "red"; }
            })
            .text(function (d) { return "*".repeat(d.depth) + d.data.name; })
            .on("click", function (d) {
                if (this.getAttribute("class").match(/disabled/)) {
                    return;
                } else {
                    $("#link-nav-change-comp-parent").sideNav("hide");
                    return changeParent(d);
                }
            })

        var changeParent = function (prnt) {
            var oldIndex = self.node.parent.children.indexOf(self.node);
            var oldPtr = getJptr(self.node);
            var newIndex = prnt.data.children === undefined ? 0 : prnt.data.children.length;
            var newPtr = getJptr(prnt) + "/children/" + newIndex;
            swapJptr(self.node, oldPtr, newPtr);
            if (prnt.data.children === undefined) {
                prnt.data.children = Array();
            }
            prnt.data.children.push(self.node.data);
            self.node.parent.data.children.splice(oldIndex, 1);
            delJptr(oldPtr, self.modelroot);
            self.controller.reload(selectJptr = newPtr);
        }

        d3.select(".btn-change-comp-parent")
            .on("click", function () {
                $("#link-nav-change-comp-parent").sideNav("show");
            })
    }
    this.addFPParentCollection = function () {
        var self = this;

        var belongTo = self.type == "func" ? self.node.isb : self.node.icb;
        // list of parent candidate func
        var prnts = belongTo.ancestors()
            .reduce(function (a, b) {
                return a.concat(b.func);
            }, Array())
            .filter(function (elm) {
                // 自分自身とすでに登録済のfunc-nodeは除外
                if (elm == self.node || self.node.parents.indexOf(elm) != -1) {
                    return false;
                }
                return true;
            })

        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header");
        collection.append("li").attr("class", "collection-header")
            .append("h6").text("Parent")
            .append("span").attr("class", "btn-add-comp-parent secondary-content")
            .append("i").attr("class", "material-icons").text("add");
        collection.selectAll("li.collection-item")
            .data(self.node.parents).enter()
            .append("li").attr("class", "collection-item drag")
            .style("display", "table")
            .text(function (d) { return d.data.name; })
            .call(addRemoveIcon);

        // parents addition nav
        d3.select("#nav-change-comp-parent .collection-header")
            .text('Select Parent of "' + self.node.data.name + '"');
        var navItems = d3.select("#nav-change-comp-parent")
            .selectAll("a.collection-item")
            .data(prnts);
        navItems.exit().remove();
        var enteredNavItems = navItems.enter()
            .append("a")
            .attr("href", "#!")
            .attr("class", "collection-item");
        enteredNavItems.append("div");
        var margedNavItems = enteredNavItems.merge(navItems);
        margedNavItems
            .text(function (d) { return "*".repeat(d.depth) + d.data.name; })
            .style("color", null)
            .on("click", function (d) {
                var newJptr = getJptr(d.isb, "/func/" + d.isb.func.indexOf(d));
                self.node.data.parents.push(newJptr);
                $("#link-nav-change-comp-parent").sideNav("hide");
                self.controller.reload(selectJptr = getJptr(self.node));
            })

        collection.select(".btn-add-comp-parent")
            .on("click", function () {
                $("#link-nav-change-comp-parent").sideNav("show");
            })

        // Sortable List option
        var sortableDom = $(collection.node())[0];
        var del = function (evt) {
            var _del = function () {
                evt.item.parentNode.removeChild(evt.item);  // remove element in sorable list
                // remove element in model
                self.node.data.parents.splice(evt.oldIndex - 1, 1);
                self.controller.reload(selectJptr = getJptr(self.node));
            }
            confirmDelNode(self.node.parents[evt.oldIndex - 1].data.name, _del);
        }
        var sort = function (evt) {
            var _old = evt.oldIndex;
            var _new = evt.newIndex;
            var _oldPrnt = self.node.data.parents[_old - 1];
            self.node.data.parents[_old - 1] = self.node.data.parents[_new - 1];
            self.node.data.parents[_new - 1] = _oldPrnt;
            self.controller.reload(selectJptr = getJptr(self.node));
        }
        Sortable.create(sortableDom, {
            animation: 100,
            draggable: ".drag",
            filter: ".js-remove",
            onFilter: del,
            // drag後の処理
            onUpdate: sort
        });
    }
    /*
    * @param {Array} arr Data array for this collection
    * @param {str} title Collection table title
    * @param {str} modalTitle
    * @param {str} divider JSON pointer divider for array
    * @param {function(str)} add Input string is given as argument.
    */
    this.addVaribleNumberCollection = function (arr, title, modalTitle, divider, add) {
        var self = this;
        d3.select("#modal-add-element").select("h4")
            .text(modalTitle);
        var _add = function () {
            var inputstr = $("#input-modal-add-element").val();
            add(inputstr);
        }

        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header");
        collection.append("li").attr("class", "collection-header")
            .append("h6").text(title)
            .append("span").attr("class", "btn-add-child secondary-content")
            .append("i").attr("class", "material-icons").text("add")
            // add new child
            .on("click", function () {
                $("#modal-add-element").modal("open");
                $("#modal-add-element form")[0].reset();  // inputテキストボックスを空にする
                $("#input-modal-add-element").focus();  // テキストボックスにフォーカス
                d3.select("#modal-add-element form")
                    .on("submit", function () {
                        _add();
                        $("#modal-add-element").modal("close");
                        return false;
                    });
                d3.select("#modal-add-element a")  // behavior when AGREE button clicked
                    .on("click", function () { return _add() });
            });
        collection.selectAll("li.collection-item")
            .data(arr)
            .enter()
            .append("li").attr("class", "collection-item drag")
            .style("display", "table")
            .text(function (d) { return d.name; })
            .call(addRemoveIcon);
        // sortable option
        var sortableDom = $(collection.node())[0];
        var del = function (evt) {
            var _del = function () {
                evt.item.parentNode.removeChild(evt.item);  // remove element in sorable list
                // remove element in model
                arr.splice(evt.oldIndex - 1, 1);
                var _jptr = getJptr(self.node);
                _jptr += "/" + divider + "/" + String(evt.oldIndex - 1);
                delJptr(_jptr, self.modelroot)
                self.controller.reload(selectJptr = getJptr(self.node));
            }
            confirmDelNode(arr[evt.oldIndex - 1].name, _del);
        }
        var sort = function (evt) {
            var oldi = evt.oldIndex;
            var newi = evt.newIndex;
            var _jptr = getJptr(self.node);
            var oldJptr = _jptr + "/" + divider + "/" + (oldi - 1);
            var newJptr = _jptr + "/" + divider + "/" + (newi - 1);
            // temporary variable of old element
            var _t = arr[oldi - 1];
            // old <- new
            arr[oldi - 1] = arr[newi - 1];
            // new <- old
            arr[newi - 1] = _t;
            // swap json pointer indicating parent of func-, param-node
            swapJptr(self.node, oldJptr, newJptr);
            // データ再構築
            self.controller.reload(_jptr);
        }
        Sortable.create(sortableDom, {
            animation: 100,
            draggable: ".drag",
            filter: ".js-remove",
            onFilter: del,
            // drag後の処理
            onUpdate: sort
        });
    }
    this.addCompChildrenCollection = function () {
        var self = this;
        // create new child for modal input
        var addChild = function (newName) {
            var newCompObj = makeNewComp(newName);
            if (self.node.data.children === undefined) {
                self.node.data["children"] = [];
            }
            self.node.data.children.push(newCompObj);
            var newJptr = getJptr(self.node);
            self.controller.reload(selectJptr = newJptr);
        }
        var arr = this.node.data.children ? this.node.data.children : [];
        var modalTitle = "Input New Children Component Name"
        this.addVaribleNumberCollection(arr, "Children", modalTitle, "children", addChild);
    }
    this.addCompFuncCollection = function () {
        var self = this;
        // create new func for modal input
        var addFunc = function (newName) {
            var newObj = makeNewFunc(newName);
            if (self.node.data.func === undefined) {
                self.node.data["func"] = [];
            }
            self.node.data.func.push(newObj);
            var newJptr = getJptr(self.node);
            self.controller.reload(selectJptr = newJptr);
        }
        var arr = this.node.data.func ? this.node.data.func : [];
        var modalTitle = "Input New Function Name"
        this.addVaribleNumberCollection(arr, "Function", modalTitle, "func", addFunc);
    }
    this.addCompParamCollection = function () {
        var self = this;
        // create new param for modal input
        var addParam = function (newName) {
            var newObj = makeNewParam(newName);
            if (self.node.data.param === undefined) {
                self.node.data["param"] = [];
            }
            self.node.data.param.push(newObj);
            var newJptr = getJptr(self.node);
            self.controller.reload(selectJptr = newJptr);
        }
        var arr = this.node.data.param ? this.node.data.param : [];
        var modalTitle = "Input New Parameter Name"
        this.addVaribleNumberCollection(arr, "Parameter", modalTitle, "param", addParam);
    }
    this.addNoteCollection = function () {
        var self = this;
        var noteStr = "";
        if (self.node.data.note) {
            noteStr = self.node.data.note;
        } else {
            self.node.data.note = "";
        }

        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header");
        collection.append("li").attr("class", "collection-header")
            .append("h6")
            .text("Note");
        collection.append("li").attr("class", "collection-item")
            .append("div").attr("class", "input-field")
            .append("textarea").attr("class", "materialize-textarea")
            .property("value", noteStr)
            .on("change", function () {
                self.node.data.note = d3.select(this).property("value");
                self.controller.reload(selectJptr = getJptr(self.node));
            });

        $(collection.select("textarea").node()).trigger("autoresize");
    }
    this.addBelongCollection = function () {
        var self = this;
        var belongTo = "";
        if (self.type == "func") {
            belongTo = self.node.isb.data.name;
        }
        else if (self.type == "param") {
            belongTo = self.node.icb.data.name;
        }
        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header");
        collection.append("li").attr("class", "collection-header")
            .append("h6")
            .text("Component");
        collection.append("li").attr("class", "collection-item")
            .text(belongTo);
    }
    this.addFixChildrenCollection = function () {
        var self = this;
        var collection = this.d3root.append("ul")
            .attr("class", "collection with-header");
        collection.append("li").attr("class", "collection-header")
            .append("h6").text("Children");
        collection.selectAll("li.collection-item")
            .data(function () { return self.node.children ? self.node.children : [] })
            .enter().append("li").attr("class", "collection-item")
            .text(function (d) { return d.data.name; });
    }

    this.generateCompEditPane = function () {
        this.addNameCollection();
        this.addCategoryCollection();
        this.addParentCollection();
        this.addCompChildrenCollection();
        this.addCompFuncCollection();
        this.addCompParamCollection();
        this.addNoteCollection();
    }
    this.generateFuncEditPane = function () {
        this.addNameCollection();
        this.addCategoryCollection();
        this.addBelongCollection();
        this.addFPParentCollection();
        this.addFixChildrenCollection();
        this.addNoteCollection();
    }
    this.generateParamEditPane = function () {
        this.addNameCollection();
        this.addCategoryCollection();
        this.addBelongCollection();
        this.addFPParentCollection();
        this.addNoteCollection();
    }
    this.generatePane = function () {
        d3.select("#slide-out").selectAll("div")
            .style("display", "none");
        this.d3root.style("display", "block");
        this.d3root.selectAll(".collection").remove();
        if (this.type == "comp") { this.generateCompEditPane(); }
        if (this.type == "func") { this.generateFuncEditPane(); }
        if (this.type == "param") { this.generateParamEditPane(); }
    }
    this.regenerate = function () {
        var _jptr = getJptr(this.node);
        this.setNode(parseJptr(this.modelroot, _jptr));
        this.generatePane();
    }
}

// tree instances controller
var TreeController = function () {
    this.model = new TreeModel();
    this.editor = new NodeEditor(this);

    // view
    this.trees = Array();
    this.trees.push(new ComponentTree());
    this.trees.push(new FMTree());
    this.trees.push(new Funcburst());

    // prototype
    p = TreeController.prototype;

    // モデル再計算
    p.computeModel = function () {
        this.model.makeCompTreeModel();
        this.model.makeFMTreeModel();
        this.model.makeFuncburstModel();
    }
    // Tree viewの描画
    p.drawSVG = function (fit, selectJptr) {
        this.trees
            .filter(function (tree) {
                return tree.isActiveSVG();
            })
            .forEach(function (tree) {
                tree.drawSVG(this.model, selectJptr);
                tree.fit();
            }, this)
    }
    // Tree viewを新しいウィンドウに描画
    p.drawSvgOnNewWindow = function () {
        this.trees
            .filter(function (tree) {
                return tree.isActiveSVG();
            })
            .forEach(function (tree) {
                tree.drawSvgOnNewWindow(this.model);
            }, this)
    }

    p.reload = function (selectJptr = undefined) {
        this.computeModel();
        this.drawSVG(true, selectJptr);
    };
    // 画面遷移したことをtreeのインスタンスに通知
    p.notice = function () {
    };
};
var trees = new TreeController();

// get URL parameter and read initial data
if (1 < document.location.search.length) {
    var query = document.location.search.substring(1);
    var param = query.split("&");
    var paramMap = Object();
    param.forEach(function (e) {
        var _elem = e.split("=");
        var _key = decodeURIComponent(_elem[0]);
        var _item = decodeURIComponent(_elem[1]);
        paramMap[_key] = _item;
    });
    if (paramMap["data"]) {
        d3.json(paramMap["data"], function (error, data) {
            if (!error) {
                trees.model.setData(data);
            }
        });
    }
}

// initialize materialize plugin and SVG window-size
$(document).ready(function () {
    // materialize initialization
    $('.modal').modal();
    $(".button-collapse").sideNav();
    $("select").material_select();
    // SVG画面サイズ調整
    var resizeSVG = function () {
        hsize = $(window).height() - ($("#top-nav").height() + $("#tree-tab").height()) - 5;
        $("main").css("height", hsize + "px");
    }
    resizeSVG();
    $(window).resize(function () {
        resizeSVG();
    });
    trees.reload(fit = true);
});

// crate new file
$("#create-new").click(function () {
    var _createNew = function () {
        trees.model.setData();
        trees.reload(true);
        highlightNode();
    }
    confirmDelNode("", _createNew, "Are you sure you want to create new tree? Unsaved data will be lost.");
});
// open file
$(document).ready(function () {
    $("#readjson").click(function () {
        $(this).val("");
    })
    $("#readjson").change(function (e) {
        var file = e.target.files[0];
        // FileReader.onloadイベントに
        // ファイル選択時に行いたい処理を書く
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                // JSONに変換
                _data = $.parseJSON(reader.result);
                trees.model.setData(_data);
                trees.reload(fit = true);
            }
            catch (e) {
                // JSONではないファイルを読込んだとき
                alert("error: Invalid Data");
            }
            setEditPane();
        };
        // Textとしてファイルを読み込む
        reader.readAsText(file);
    });
}, false);
// save file
$("#download").click(function () {
    var filename = $(".file-path.validate").val() || "funcburstdata.json";
    var outJson = trees.model.stringifyJson();
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
    var nw = window.open();
    var load = function () {
        if (nw && nw.document && nw.document.body) {
            var pre = nw.document.createElement("pre");
            pre.innerHTML = trees.model.stringifyJson();
            nw.document.body.appendChild(pre);
        }
        else {
            window.setTimeout(function () { svgLoad(); }, 100);
        }
    }
    load();
});
// open svg in new window
$("#show-svg").click(function () {
    trees.drawSvgOnNewWindow();
});
// reload action when reload button is clicked
$("#reload").click(function () {
    setEditPane();
    trees.reload(fit = true);
});
// reload action when tab transition
var tabObserver = new MutationObserver(function (rec, obs) {
    setEditPane();
    trees.reload(fit = true);
});
// 各ツリーすべてを監視できるようにする必要あり
tabObserver.observe($("main div.container").get(0), {
    attributes: true
})
tabObserver.observe($("main div.container").get(1), {
    attributes: true
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



function tspanStringify(strArr) {
    var _html = "";
    strArr.forEach(function (str, index) {
        _html += '<tspan class="line' + index + '"' + 'y="' + index + 'em" x="0em">'
            + str + '</tspan>';
    });
    return _html;
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

// create dictionary of new component node
function makeNewComp(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["func"] = [];
    dic["param"] = [];
    dic["children"] = [];
    dic["note"] = "";
    return dic;
}

// create dictionary of new function node
function makeNewFunc(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["parents"] = [];
    dic["note"] = "";
    return dic;
}

// create dictionary of new parameter node
function makeNewParam(name) {
    var dic = {};
    dic["name"] = name;
    dic["cat"] = "";
    dic["parents"] = [];
    dic["note"] = "";
    return dic;
}

// get json-pointer of the node
function getJptr(node, ptr = "") {
    if (node.isb) {
        var idx = node.isb.func.indexOf(node);
        return getJptr(node.isb, "/func/" + idx + ptr);
    } else if (node.icb) {
        var idx = node.icb.param.indexOf(node);
        return getJptr(node.icb, "/param/" + idx + ptr);
    }
    else if (node.parent === null) {
        return ptr;
    } else {
        var idx = node.parent.children.indexOf(node);
        return getJptr(node.parent, "/children/" + idx + ptr);
    }
}

// delete json pointer
// jptr: json pointer to delete
// node: root node for searching json pointer
function delJptr(jptr, node) {
    var argIndex = jptr.match(/\d+$/)[0];  // indexを切り出し
    var jptrLeft = jptr.slice(0, -argIndex.length);
    var re = RegExp("^" + jptrLeft)
    var _del = function (prnts) {
        var index = prnts.length - 1;
        while (index >= 0) {
            // 引数のjptrと、data中のjptrのindexを比較
            var _right = prnts[index].split(re)[1];
            if (_right !== undefined) {
                var jptrIndex = _right.match(/^\d+/)[0];  // each要素のindex
                var jptrRight = _right.split(/^\d+/)[1];  // each要素のindex以降のjptr文字列
                if (jptrIndex == argIndex) {
                    prnts.splice(index, 1);
                }
                // 削除したindexより後の要素を繰り上げ
                else if (Number(jptrIndex) > Number(argIndex)) {
                    var newNum = Number(jptrIndex) - 1;
                    prnts[index] = jptrLeft + String(newNum) + jptrRight;
                }
            }
            index--;
        }
    }
    node.descendants().forEach(function (d) {
        d.data.func.forEach(function (f) {
            _del(f.parents);
        })
        d.data.param.forEach(function (p) {
            _del(p.parents);
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
    highlightNode();
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
function confirmDelNode(name, f, anotherText = undefined) {
    $("#modal-remove-confirm .modal-content h4")
        .text(function () {
            if (anotherText) {
                return anotherText;
            } else {
                return 'Are you sure you want to delete "' + name + '"';
            }
        });
    $("#modal-remove-confirm").modal("open");
    d3.select("#modal-remove-confirm a")
        .on("click", f)
}


// fill color to emphasize selected node in svg
function highlightNode(node) {
    d3.select("#compTreeSVG .highlight")
        .selectAll("rect").remove();
    if (node === undefined) { return; }
    d3.select("#compTreeSVG .highlight")
        .attr("transform", "translate(" + node.y + "," + node.x + ")")
        .append("rect")
        .attr("x", 0).attr("y", -5).attr("width", 120).attr("height", 10)
        .attr("fill", "#64ffda");
}

// treeのseparater カリー化
function separate(getSub, a, b) {
    return function (a, b) {
        var sep = 2;  // space between nodes
        // root of node a/b
        var _root = a.ancestors()
            .filter(function (d) { return d.depth === 0; })[0];

        // comp-, func-, parm-nodeのラベル幅を求める(子ノードは考慮しない)
        var getWidth = function (node) {
            var width = 0;
            width += node.label.length;
            getSub(node).forEach(function (f) {
                width += f.label.length;
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
            var rootAandB = parseJptr(_root, jptrA.substring(0, jptrIndex))

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
    }
};

// update category settings modal content
function updateCatSettings(catObj, updateEditPane) {
    if (!("sort" in window)) {
        sort = {}
    };
    var _update = function (id, type) {
        // reset add category form
        $("#" + id + " .add_cat form")[0].reset();

        if (!catObj[type]) {
            catObj[type] = [];
        }

        var cat = d3.select("#" + id).select("ul")
            .selectAll("li.collection-item")
            .data(catObj[type]);
        cat.exit().remove();
        var enteredCat = cat.enter()
            .append("li");
        enteredCat.append("div")
            .attr("onsubmit", "return false;")
            .attr("class", "input-field");
        enteredCat.select("div")
            .append("i").attr("class", "material-icons prefix");
        enteredCat.select("div")
            .append("input");
        // remove icon
        enteredCat.call(addRemoveIcon);
        var updatedCat = enteredCat.merge(cat)
            .attr("class", "collection-item drag");
        // category color mark
        updatedCat.select("i")
            .style("color", function (d) { return getCatColor(catObj, d, type) })
            .text("crop_square");
        // category name
        updatedCat.select("input")
            .property("value", function (d) { return d; });
        // change category name
        updatedCat.select("input")
            .on("change", function (d) {
                swapCategory(type, d, d3.event.target.value);
                _update(id, type);
                updateEditPane();
            });
        function swapCategory(type, oldStr, newStr) {
            catObj[type][catObj[type].indexOf(oldStr)] = newStr;
            var des = {
                "comp": root.descendants(),
                "func": root.funcDescendants(),
                "param": root.paramDescendants()
            }
            des = des[type];
            des.forEach(function (d) {
                if (d.data.cat == oldStr) {
                    d.data.cat = newStr;
                }
            })
        };
        // set RegExp pattern in <input> for validation
        // inhibit to input already registered name
        d3.select("#" + id + " .add_cat input")
            .attr("pattern", function () {
                var re;
                if (catObj[type].length != 0) {
                    re = "^(?!";
                    re += catObj[type].reduce(function (a, b) {
                        if (a === "") {
                            return b;
                        }
                        else {
                            return a + "|" + b;
                        }
                    }, "")
                    re += ").*$"
                }
                else {
                    re = ".*"
                }
                return re;
            });
        // add category
        d3.select("#" + id + " .add_cat form")
            .on("submit", function () {
                var addInput = d3.select("#" + id + " .add_cat input");
                var newCat = addInput.property("value");
                catObj[type].push(newCat);
                _update(id, type);
                updateEditPane();
            })
        // sortable.js option
        if (sort[id]) {
            sort[id].destroy();
        }
        var list = $("#" + id + " ul").get(0);
        sort[id] = Sortable.create(list, {
            animation: 100,
            draggable: ".collection-item.drag",
            onUpdate: function (evt) {  // behavior on drag
                var _ = catObj[type][evt.oldIndex - 1];
                catObj[type][evt.oldIndex - 1] = catObj[type][evt.newIndex - 1];
                catObj[type][evt.newIndex - 1] = _;
                _update(id, type);
                updateEditPane();
                d3.select("#comp-tree").selectAll("." + type + "Node")
                    .call(styleNode);
            },
            // remove item
            filter: ".js-remove",
            onFilter: function (evt) {
                if (Sortable.utils.is(evt.target, ".js-remove")) {  // Click on remove button
                    var _del = function () {
                        var item = evt.item;
                        item.parentNode.removeChild(item); // remove sortable item
                        // datasetから削除
                        catObj[type].splice(evt.oldIndex - 1, 1);
                        _update(id, type);
                        updateEditPane();
                        d3.select("#comp-tree").selectAll("." + type + "Node")
                            .call(styleNode);
                    }
                    confirmDelNode(catObj[type][evt.oldIndex - 1], _del);
                }
            }
        });
    }
    _update("cat-set-comp", "comp");
    _update("cat-set-func", "func");
    _update("cat-set-param", "param");
}

// set style of node in SVG
// use from d3.select.call()
function styleNode(selection) {
    // 要素がないselectionでもcallで関数呼ばれるので、エラー回避のために要素数判定してreturn
    if (selection._groups[0].length === 0) {
        return;
    }
    var treeType = "";
    var treeSVGId = selection.node().ownerSVGElement.getAttribute("id");
    if (treeSVGId == "compTreeSVG") {
        treeType = "compTree";
    } else if (treeSVGId == "FMTreeSVG") {
        treeType = "FMTree";
    }

    var type = selection.attr("class").match(/(.*)Node/)[1];

    var baseline = {
        "comp": "auto",
        "func": "central",
        "param": "central"
    }
    if (treeType == "FMTree") {
        baseline["func"] = "auto";
    }

    var circleCol = {
        "comp": "teal",
        "func": "red",
        "param": "orange"
    }

    var circleRadius = { "comp": 4, "func": 3, "param": 3 };
    if (treeType == "FMTree") {
        circleRadius = { "comp": 4, "func": 4, "param": 3 };
    }

    selection.select("text")
        .attr("stroke", function (d) {
            if (d.cdata) {
                return getCatColor(trees.model.category, d.cdata.cat, type);
            } else {
                return getCatColor(trees.model.category, d.data.cat, type);
            }
        })
        .attr("paint-order", "stroke")
        .attr("stroke-width", "1.0px")
        .attr("dominant-baseline", baseline[type])
        .attr("dx", "4");

    selection.select("circle")
        .attr("r", circleRadius[type])
        .attr("fill", circleCol[type]);

    // add tooltip displaying note
    selection.classed("note-tooltip", function (d, i, a) {
        var _data = d.cdata ? d.cdata : d.data;
        if (_data.note) {
            $(a[i]).tooltip({ tooltip: _data.note, delay: 50, position: "left" });
            return true;
        } else {
            if (d3.select(this).classed("note-tooltip")) {
                $(a[i]).tooltip("remove");
            }
            return false;
        }
    });
}

// get category color
// catStr: category name string, type: comp/func/paraam
function getCatColor(catObj, catStr, type) {
    if (!catObj[type]) {
        catObj[type] = [];
    }
    var index = catObj[type].indexOf(catStr);
    if (index == -1) {
        return undefined;
    }
    index = index % 10;
    var cat20bc = d3.schemeCategory20b.concat(d3.schemeCategory20c);
    if (type == "comp") {
        return d3.schemeCategory10[index];
    } else if (type == "func") {
        return cat20bc[index * 4];
    } else if (type == "param") {
        return cat20bc[index * 4 + 2];
    } else {
        return undefined;
    }
}

// add suffix remove icon for collection-item
// selection: d3-selector for "collection-item" classed <li> element
function addRemoveIcon(selection) {
    selection.append("span").attr("class", "suffix")
        .append("i")
        .attr("class", "js-remove material-icons")
        .text("remove_circle_outline");
}

/**
 * fill background color with pale blue for the selected node
 * and reset background fill for unselected nodes
 * use this function via d3.selection.call
 * @param {d3.selection} selection selected node
 * @param {d3.selection} svgSelection <svg> selection
 */
function fillSelectedNode(selection, svgSelection) {
    svgSelection.selectAll(".selected-fill").remove();
    var bbox = selection.node().getBBox();
    selection.select(".selected").append("rect")
        .attr("x", bbox.x).attr("y", bbox.y)
        .attr("width", bbox.width).attr("height", bbox.height)
        .attr("fill", "#64ffda")
        .attr("fill-opacity", 0.5)
        .attr("class", "selected-fill");
}