package org.dc34.badgemanager;

final class AssetPathPolicy {
    private AssetPathPolicy() {}

    static boolean isSafe(String path) {
        if (path == null || path.isEmpty() || path.startsWith("/") || path.contains("\\")) return false;
        for (String segment : path.split("/")) {
            if (segment.isEmpty() || segment.equals(".") || segment.equals("..")) return false;
        }
        return true;
    }
}
