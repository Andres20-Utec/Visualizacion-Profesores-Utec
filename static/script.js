document.addEventListener('DOMContentLoaded', function() {
    const svg = d3.select("svg");
    const infoPanel = d3.select("#info-panel");
    const relationshipSelect = d3.select("#relationship-select"); // Get the select element

    // Get initial dimensions
    let width = +svg.node().getBoundingClientRect().width;
    let height = +svg.node().getBoundingClientRect().height;

    // Clear initial info panel content
    infoPanel.html("<h2>Node Information</h2><p>Hover over a node to see details.</p>");

    // Append a group container for the network elements
    const g = svg.append("g");

    // Define zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });
    svg.call(zoom);

    // Keep track of simulation and selections
    let simulation = null;
    let link = null;
    let node = null;

    // Define color scale for Degree Centrality (using Blues)
    const degreeColorScale = d3.scaleSequential(d3.interpolateBlues);

    // Define size scale for Research Papers (this scale's domain won't change)
    const paperSizeScale = d3.scaleLinear()
        .range([15, 40]); // Node radius range

    // Define color scale for Betweenness Centrality (optional, for stroke or tooltip)
    // const strokeColorScale = d3.scaleSequential(d3.interpolateYlOrRd);


    // Function to update the network visualization based on attribute
    function updateNetwork(attribute) {
        console.log(`Loading network data for attribute: ${attribute}`);
        // Load data from the new Flask route
        d3.json(`/data/${attribute}`).then(function(data) {
            const nodes = data.nodes;
            const links = data.links;
            console.log(`Loaded ${nodes.length} nodes and ${links.length} links.`);

            // Update scale domains based on *new* data for this network
            paperSizeScale.domain(d3.extent(nodes, d => d.researchPapers)); // Papers domain is constant but good practice
            const maxDegree = d3.max(nodes, d => d.degreeCentrality) || 0.1;
            // const maxBetweenness = d3.max(nodes, d => d.betweennessCentrality) || 0.1;
            degreeColorScale.domain([0, maxDegree]);
            // strokeColorScale.domain([0, maxBetweenness]);


            // Stop existing simulation if it exists
            if (simulation) {
                simulation.stop();
            }

            // Create or update the force simulation
            simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(d => d.id).distance(100))
                .force("charge", d3.forceManyBody().strength(-300))
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force("x", d3.forceX(width / 2).strength(0.05))
                .force("y", d3.forceY(height / 2).strength(0.05));

            // --- Update Links ---
            link = g.select(".links").selectAll("line")
                .data(links, d => `${d.source.id}-${d.target.id}`); // Use a key function for updates

            // Exit old links
            link.exit().remove();

            // Enter new links
            const linkEnter = link.enter().append("line").attr("class", "link");

            // Update existing and new links
            link = linkEnter.merge(link);


            // --- Update Nodes ---
            // Select the group for nodes, then select all child groups with class "node"
            node = g.select(".nodes").selectAll(".node")
                 .data(nodes, d => d.id); // Use node id as key function


            // Exit old nodes (groups)
            node.exit().remove();

            // Enter new nodes (groups)
            const nodeEnter = node.enter().append("g")
                 .attr("class", "node");

            // Append clip paths for entered nodes
            nodeEnter.append("clipPath")
                .attr("id", d => "clip-" + d.id)
                .append("circle")
                .attr("r", d => paperSizeScale(d.researchPapers)); // Clip size matches node size


            // Append image for entered nodes
            nodeEnter.append("image")
                .attr("xlink:href", d => d.imageUrl || 'placeholder.jpg')
                .attr("x", d => -paperSizeScale(d.researchPapers))
                .attr("y", d => -paperSizeScale(d.researchPapers))
                .attr("width", d => paperSizeScale(d.researchPapers) * 2)
                .attr("height", d => paperSizeScale(d.researchPapers) * 2)
                .attr("clip-path", d => "url(#clip-" + d.id + ")")
                .attr("onerror", "this.onerror=null; this.src='/static/placeholder.jpg';"); // Fallback image


            // Append circle border for entered nodes
            nodeEnter.append("circle")
                .attr("r", d => paperSizeScale(d.researchPapers))
                .attr("fill", "none") // Transparent fill
                .attr("stroke", d => degreeColorScale(d.degreeCentrality)) // Color based on centrality
                .attr("stroke-width", 3);

            // Add drag behavior to entered nodes
            nodeEnter.call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

            // Add hover interaction to entered nodes
            nodeEnter.on("mouseover", handleMouseOver)
                     .on("mouseout", handleMouseOut);


            // Update existing nodes (apply new color based on new centrality)
            node.select("circle") // Select the circle within existing node groups
                .transition() // Add transition for smoother color change
                .duration(500)
                .attr("stroke", d => degreeColorScale(d.degreeCentrality));

            // Merge enter and update selections for future operations (like tick)
            node = nodeEnter.merge(node);


            // Ensure the 'links' group exists before 'nodes' group
            // This ensures links are drawn UNDER nodes
            g.select(".links").remove(); // Remove and re-append links group
            g.append("g").attr("class", "links");
            g.select(".links").selectAll("line")
                .data(links, d => `${d.source.id}-${d.target.id}`) // Re-bind links to the new group
                .enter().append("line").attr("class", "link");
             // Now link selection needs to be updated for the tick function
             link = g.select(".links").selectAll("line");


            // Ensure the 'nodes' group exists and is the last child (drawn on top)
            g.select(".nodes").remove(); // Remove and re-append nodes group
            g.append("g").attr("class", "nodes");
            // Re-bind nodes to the new group and re-create the structure inside
            node = g.select(".nodes").selectAll(".node")
                 .data(nodes, d => d.id)
                 .enter().append("g")
                 .attr("class", "node"); // Re-create groups

             // Re-create clip paths, images, and circles inside the new groups
             node.append("clipPath")
                 .attr("id", d => "clip-" + d.id)
                 .append("circle")
                 .attr("r", d => paperSizeScale(d.researchPapers));

             node.append("image")
                 .attr("xlink:href", d => d.imageUrl || 'placeholder.jpg')
                 .attr("x", d => -paperSizeScale(d.researchPapers))
                 .attr("y", d => -paperSizeScale(d.researchPapers))
                 .attr("width", d => paperSizeScale(d.researchPapers) * 2)
                 .attr("height", d => paperSizeScale(d.researchPapers) * 2)
                 .attr("clip-path", d => "url(#clip-" + d.id + ")")
                 .attr("onerror", "this.onerror=null; this.src='/static/placeholder.jpg';");

             node.append("circle")
                 .attr("r", d => paperSizeScale(d.researchPapers))
                 .attr("fill", "none")
                 .attr("stroke", d => degreeColorScale(d.degreeCentrality))
                 .attr("stroke-width", 3);

            // Re-apply drag and hover behavior to the new node selection
            node.call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

            node.on("mouseover", handleMouseOver)
                .on("mouseout", handleMouseOut);


            // Update positions on each tick of the simulation
            // The tick function references the 'link' and 'node' variables, which are now updated
            simulation.on("tick", () => {
                link.attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);

                node.attr("transform", d => `translate(${d.x},${d.y})`);
            });

            // Restart the simulation
            simulation.alphaTarget(0.3).restart();

        }).catch(function(error){ console.error(`Error loading data for attribute ${attribute}:`, error); });
    }


    // --- Interaction Functions ---

    function handleMouseOver(event, d) {
        // Highlight node and its neighbors
        // Select all nodes and links within the main 'g' group
        g.selectAll(".node").classed("highlighted", false);
        g.selectAll(".link").classed("highlighted", false);

        // Highlight the hovered node
        d3.select(this).classed("highlighted", true);

        // Highlight connected links and neighbor nodes
        g.selectAll(".link")
            .filter(l => l.source.id === d.id || l.target.id === d.id)
            .classed("highlighted", true)
            .each(l => {
                // Highlight the neighbor nodes as well
                const neighborId = l.source.id === d.id ? l.target.id : l.source.id;
                 g.selectAll(".node") // Select from the main g group
                     .filter(n => n.id === neighborId)
                     .classed("highlighted", true);
            });


        // Update info panel
        infoPanel.html(`
            <h2>${d.name}</h2>
            <img src="${d.imageUrl}" alt="${d.name}" onerror="this.onerror=null; this.src='/static/placeholder.jpg';">
            <p><strong>Degree:</strong> ${d.degree_text || 'N/A'}</p>
            <p><strong>University:</strong> ${d.university || 'N/A'}</p>
            <p><strong>Country:</strong> ${d.universityCountry || 'N/A'}</p>
            <p><strong>Research Papers:</strong> ${d.researchPapers}</p>
            <p><strong>Connections (Degree Centrality):</strong> ${d.degreeCentrality.toFixed(3)}</p>
            <p><strong>Betweenness Centrality:</strong> ${d.betweennessCentrality.toFixed(3)}</p>
        `);
    }

    function handleMouseOut(event, d) {
        // Remove highlighting
         g.selectAll(".node").classed("highlighted", false);
         g.selectAll(".link").classed("highlighted", false);

        // Reset info panel
        infoPanel.html("<h2>Node Information</h2><p>Hover over a node to see details.</p>");
    }

    // --- Drag functions ---
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        // Keep node fixed on drag end
        // d.fx = null; // Uncomment these lines to let the node move freely after drag
        // d.fy = null;
    }

    // --- Initial Load and Event Listener ---

    // Load the default network ('university') on page load
    updateNetwork(relationshipSelect.property("value"));

    // Add event listener to the select element to change network
    relationshipSelect.on("change", function() {
        const selectedAttribute = d3.select(this).property("value");
        updateNetwork(selectedAttribute);
    });

    // Optional: Handle window resize to update center force
    window.addEventListener('resize', function() {
        width = +svg.node().getBoundingClientRect().width;
        height = +svg.node().getBoundingClientRect().height;
        if (simulation) {
             simulation.force("center", d3.forceCenter(width / 2, height / 2));
             // simulation.alpha(1).restart(); // Can restart simulation on resize if desired
        }
    });

     // Ensure the initial groups for links and nodes exist
    g.append("g").attr("class", "links");
    g.append("g").attr("class", "nodes");

});