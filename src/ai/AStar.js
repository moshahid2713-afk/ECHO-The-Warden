/**
 * A* Pathfinding Algorithm for 2D Grid Maze
 * 4-directional cardinal movement (North, South, East, West)
 * Standard coordinate order: (row, col)
 * Walkability rule: ONLY 1 is a wall. 0, 2, 3, 4 are ALL walkable.
 */
export class AStar {
  /**
   * Helper to ensure coordinates resolve to a walkable cell.
   * If (row, col) is on/near a wall, finds the nearest adjacent walkable cell.
   */
  static getWalkableCell(row, col, maze) {
    const r = Math.max(0, Math.min(maze.rows - 1, row));
    const c = Math.max(0, Math.min(maze.cols - 1, col));

    if (maze.isWalkableCell(r, c)) {
      return { row: r, col: c };
    }

    // 4 cardinal neighbors
    const cardinal = [
      { dRow: -1, dCol: 0 },
      { dRow: 1,  dCol: 0 },
      { dRow: 0,  dCol: -1 },
      { dRow: 0,  dCol: 1 }
    ];

    for (const { dRow, dCol } of cardinal) {
      const nr = r + dRow;
      const nc = c + dCol;
      if (maze.isWalkableCell(nr, nc)) {
        return { row: nr, col: nc };
      }
    }

    // 8-directional neighbors fallback
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (maze.isWalkableCell(r + dr, c + dc)) {
          return { row: r + dr, col: c + dc };
        }
      }
    }

    return { row: r, col: c };
  }

  /**
   * Find 4-directional A* path from start { row, col } to goal { row, col }
   * @param {{row: number, col: number}} rawStart - Starting grid coordinate
   * @param {{row: number, col: number}} rawGoal - Goal grid coordinate
   * @param {Object} maze - Maze instance providing isWalkableCell(row, col)
   * @returns {Array<{row: number, col: number}>} - Path of grid coordinates from start to goal
   */
  static findPath(rawStart, rawGoal, maze) {
    if (!rawStart || !rawGoal || !maze) return [];

    // Standardize { row, col }
    const startRow = rawStart.row !== undefined ? rawStart.row : rawStart.r;
    const startCol = rawStart.col !== undefined ? rawStart.col : rawStart.c;
    const goalRow = rawGoal.row !== undefined ? rawGoal.row : rawGoal.r;
    const goalCol = rawGoal.col !== undefined ? rawGoal.col : rawGoal.c;

    const start = this.getWalkableCell(startRow, startCol, maze);
    const goal = this.getWalkableCell(goalRow, goalCol, maze);

    // If goal is not walkable, cannot path
    if (!maze.isWalkableCell(goal.row, goal.col)) return [];

    // If already at goal
    if (start.row === goal.row && start.col === goal.col) {
      return [{ row: start.row, col: start.col }];
    }

    const key = (r, c) => `${r},${c}`;
    const startKey = key(start.row, start.col);

    // Manhattan distance heuristic
    const heuristic = (r, c) => {
      return Math.abs(r - goal.row) + Math.abs(c - goal.col);
    };

    const openSet = new Map();
    const closedSet = new Set();

    const startNode = {
      row: start.row,
      col: start.col,
      g: 0,
      h: heuristic(start.row, start.col),
      f: heuristic(start.row, start.col),
      parent: null
    };

    openSet.set(startKey, startNode);

    // 4 cardinal directions only: Up, Down, Left, Right (NO diagonals)
    const neighbors = [
      { dRow: -1, dCol: 0 }, // North (row - 1)
      { dRow: 1,  dCol: 0 }, // South (row + 1)
      { dRow: 0,  dCol: -1 }, // West (col - 1)
      { dRow: 0,  dCol: 1 }   // East (col + 1)
    ];

    while (openSet.size > 0) {
      // Find open node with lowest f cost (tie-break on lower h)
      let current = null;
      let currentKey = null;

      for (const [k, node] of openSet.entries()) {
        if (
          !current ||
          node.f < current.f ||
          (node.f === current.f && node.h < current.h)
        ) {
          current = node;
          currentKey = k;
        }
      }

      // Reached goal: reconstruct path
      if (current.row === goal.row && current.col === goal.col) {
        const path = [];
        let curr = current;
        while (curr) {
          path.unshift({ row: curr.row, col: curr.col });
          curr = curr.parent;
        }
        return path;
      }

      openSet.delete(currentKey);
      closedSet.add(currentKey);

      for (const { dRow, dCol } of neighbors) {
        const nextRow = current.row + dRow;
        const nextCol = current.col + dCol;
        const nKey = key(nextRow, nextCol);

        if (closedSet.has(nKey)) continue;
        if (!maze.isWalkableCell(nextRow, nextCol)) continue;

        const tentativeG = current.g + 1;

        const existing = openSet.get(nKey);
        if (!existing) {
          const h = heuristic(nextRow, nextCol);
          const neighborNode = {
            row: nextRow,
            col: nextCol,
            g: tentativeG,
            h: h,
            f: tentativeG + h,
            parent: current
          };
          openSet.set(nKey, neighborNode);
        } else if (tentativeG < existing.g) {
          existing.g = tentativeG;
          existing.f = tentativeG + existing.h;
          existing.parent = current;
        }
      }
    }

    return [];
  }
}
