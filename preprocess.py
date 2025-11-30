#!/usr/bin/env python3
"""
Preprocessing script to convert PyTorch embeddings and prompts to JSON format
for the interactive embedding map visualization.
"""

import torch
import json
from pathlib import Path


def load_embeddings(embedding_path):
    """Load the 2D embeddings from PyTorch tensor file."""
    embeddings = torch.load(embedding_path, map_location='cpu', weights_only=False)

    # Convert to numpy for easier manipulation
    if isinstance(embeddings, torch.Tensor):
        embeddings = embeddings.numpy()

    return embeddings


def load_prompts(prompts_path):
    """Load prompts from text file (one per line)."""
    with open(prompts_path, 'r', encoding='utf-8') as f:
        prompts = [line.strip() for line in f]
    return prompts


def normalize_coordinates(embeddings):
    """
    Normalize coordinates to a reasonable range for visualization.
    Centers around 0 and scales to approximately [-100, 100] range.
    """
    # Calculate bounds
    min_x = float(embeddings[:, 0].min())
    max_x = float(embeddings[:, 0].max())
    min_y = float(embeddings[:, 1].min())
    max_y = float(embeddings[:, 1].max())

    # Center the coordinates
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    centered = embeddings.copy()
    centered[:, 0] -= center_x
    centered[:, 1] -= center_y

    # Scale to fit in approximately [-100, 100] range
    # Use the maximum absolute value to maintain aspect ratio
    max_range = max(abs(centered[:, 0]).max(), abs(centered[:, 1]).max())

    if max_range > 0:
        scale_factor = 100.0 / max_range
        scaled = centered * scale_factor
    else:
        scaled = centered

    # Calculate final bounds
    bounds = {
        'minX': float(scaled[:, 0].min()),
        'maxX': float(scaled[:, 0].max()),
        'minY': float(scaled[:, 1].min()),
        'maxY': float(scaled[:, 1].max())
    }

    return scaled, bounds


def create_data_json(embeddings, prompts, output_path):
    """Create the data.json file with points and bounds."""

    if len(embeddings) != len(prompts):
        raise ValueError(
            f"Mismatch: {len(embeddings)} embeddings but {len(prompts)} prompts"
        )

    print(f"Processing {len(embeddings)} points...")

    # Normalize coordinates
    normalized_coords, bounds = normalize_coordinates(embeddings)

    # Create points array
    points = []
    for i, (coords, prompt) in enumerate(zip(normalized_coords, prompts)):
        point = {
            'id': i,
            'x': round(float(coords[0]), 4),
            'y': round(float(coords[1]), 4),
            'prompt': prompt
        }
        points.append(point)

    # Create final data structure
    data = {
        'points': points,
        'bounds': bounds
    }

    # Write to JSON file
    print(f"Writing to {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))

    # Print statistics
    file_size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"\nSuccess! Created {output_path}")
    print(f"  Points: {len(points)}")
    print(f"  Bounds: X[{bounds['minX']:.2f}, {bounds['maxX']:.2f}], "
          f"Y[{bounds['minY']:.2f}, {bounds['maxY']:.2f}]")
    print(f"  File size: {file_size_mb:.2f} MB")


def main():
    """Main preprocessing function."""

    # Paths
    base_dir = Path(__file__).parent
    embedding_path = base_dir / 'sd_clip_embeddings_2d.pt'
    prompts_path = base_dir / 'prompts.txt'
    output_path = base_dir / 'data.json'

    # Verify input files exist
    if not embedding_path.exists():
        raise FileNotFoundError(f"Embedding file not found: {embedding_path}")
    if not prompts_path.exists():
        raise FileNotFoundError(f"Prompts file not found: {prompts_path}")

    print("Loading embeddings...")
    embeddings = load_embeddings(embedding_path)
    print(f"  Loaded {len(embeddings)} embeddings with shape {embeddings.shape}")

    print("\nLoading prompts...")
    prompts = load_prompts(prompts_path)
    print(f"  Loaded {len(prompts)} prompts")

    print("\nCreating data.json...")
    create_data_json(embeddings, prompts, output_path)


if __name__ == '__main__':
    main()
