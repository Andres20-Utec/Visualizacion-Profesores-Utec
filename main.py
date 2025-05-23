from flask import Flask, render_template, jsonify, send_from_directory
import os
import pandas as pd
import networkx as nx
import json
import io
import warnings

# Ignorar advertencias de NetworkX (por ejemplo, si el grafo está vacío o singular)
warnings.filterwarnings('ignore', category=UserWarning)

def generate_network_for_attribute(df, attribute_name):
    """
    Generates nodes (with attribute-specific centrality) and edges
    based on sharing the specified attribute.
    """
    # Ensure the attribute column exists and fill NaN
    if attribute_name not in df.columns:
         # This shouldn't happen with the current data, but good practice
         print(f"Warning: Attribute '{attribute_name}' not found in data.")
         df[attribute_name] = 'No encontrado' # Create column if missing

    df[attribute_name] = df[attribute_name].fillna('No encontrado').astype(str) # Ensure string type

    nodes_data = []
    name_to_id = {}
    # Create the base nodes list (same for all networks)
    for i, row in df.iterrows():
        node_id = i # Consistent ID based on row index of unique names DF
        node = {
            "id": node_id,
            "name": row['name'],
            "imageUrl": row['url_image'],
            "degree_text": row['degree'],
            "university": row['university'],
            "universityCountry": row['university_country'],
            "researchPapers": int(row['research_papers'] if pd.notna(row['research_papers']) and str(row['research_papers']).isdigit() else 0)
            # Centrality will be added later
        }
        nodes_data.append(node)
        name_to_id[row['name']] = node_id

    # Create edges based on shared attribute_name
    edges_data = []
    attribute_values = df[attribute_name].unique()
    for value in attribute_values:
        # Group professors by this attribute value
        prof_ids = df[df[attribute_name] == value]['name'].map(name_to_id).tolist()
        if len(prof_ids) > 1:
             # Create edges between all pairs in this group
             for i in range(len(prof_ids)):
                 for j in range(i + 1, len(prof_ids)):
                     edges_data.append({"source": prof_ids[i], "target": prof_ids[j]})

    # Remove duplicate edges
    unique_edges = set()
    clean_edges = []
    for edge in edges_data:
        u, v = edge['source'], edge['target']
        # Canonical representation (smaller ID first) to ensure uniqueness
        if u > v: u, v = v, u
        if (u, v) not in unique_edges:
            unique_edges.add((u, v))
            clean_edges.append({"source": edge['source'], "target": edge['target']})

    # Create NetworkX graph
    G = nx.Graph()
    # Add ALL nodes first, even if they have no edges in this network
    for node in nodes_data:
        G.add_node(node['id'])
    # Then add edges based on the current attribute
    for edge in clean_edges:
         # Ensure nodes for edges exist (they should, as we added all nodes)
         if edge['source'] in G and edge['target'] in G:
            G.add_edge(edge['source'], edge['target'])


    # Calculate centrality measures for THIS graph structure
    degree_centrality = nx.degree_centrality(G)
    try:
        betweenness_centrality = nx.betweenness_centrality(G)
    except nx.NetworkXPointlessConcept as e:
         print(f"Graph for attribute '{attribute_name}' has components of size 1. Betweenness is 0. {e}")
         betweenness_centrality = {node_id: 0 for node_id in G.nodes()}
    except Exception as e:
        print(f"Could not calculate Betweenness Centrality for attribute '{attribute_name}': {e}. Setting to 0.")
        betweenness_centrality = {node_id: 0 for node_id in G.nodes()}


    # Add centrality scores back to the nodes_data list
    # Need to create a new list to avoid modifying the original nodes_data in place if reused
    processed_nodes_data = []
    for node in nodes_data:
        node_with_centrality = node.copy() # Create a copy
        node_with_centrality['degreeCentrality'] = degree_centrality.get(node['id'], 0)
        node_with_centrality['betweennessCentrality'] = betweenness_centrality.get(node['id'], 0)
        processed_nodes_data.append(node_with_centrality)


    return processed_nodes_data, clean_edges
df_initial = pd.read_csv("gemini_profesores.csv", sep=';')
df_unique_names = df_initial.drop_duplicates(subset=['name'], keep='first').reset_index(drop=True) # Reset index to use as ID

# --- Pre-calculate networks for all desired attributes ---
networks_data = {
    'university': generate_network_for_attribute(df_unique_names.copy(), 'university'),
    'country': generate_network_for_attribute(df_unique_names.copy(), 'university_country'),
    'degree': generate_network_for_attribute(df_unique_names.copy(), 'degree')
}

app = Flask(__name__)

@app.route('/')
def index():
    # Renders the main HTML page which will load the data via JS
    return render_template('index.html')

# New route to serve network data based on attribute
@app.route('/data/<attribute>')
def get_network_data(attribute):
    if attribute in networks_data:
        nodes, edges = networks_data[attribute]
        # Return both nodes and links in a single JSON object
        return jsonify({"nodes": nodes, "links": edges})
    # Handle invalid attribute requests
    return jsonify({"error": "Invalid attribute specified"}), 400

# Route to serve static files (like placeholder image if needed)
@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)


if __name__ == '__main__':
    # Ensure static directory exists for CSS/JS
    static_dir = 'static'
    if not os.path.exists(static_dir):
        os.makedirs(static_dir)
     # Ensure data directory exists (though we serve from memory now, was for file saving)
    data_dir = 'data1'
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    # Run the Flask development server
    app.run(debug=True, host='0.0.0.0', port=5000)