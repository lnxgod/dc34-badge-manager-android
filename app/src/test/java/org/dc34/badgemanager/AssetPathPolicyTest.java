package org.dc34.badgemanager;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class AssetPathPolicyTest {
    @Test public void acceptsBundledAssetPaths() {
        assertTrue(AssetPathPolicy.isSafe("index.html"));
        assertTrue(AssetPathPolicy.isSafe("bio/direct-led-bridge/direct-led-bridge.bin"));
    }

    @Test public void rejectsTraversalAndAbsolutePaths() {
        assertFalse(AssetPathPolicy.isSafe("../secret"));
        assertFalse(AssetPathPolicy.isSafe("bio/../secret"));
        assertFalse(AssetPathPolicy.isSafe("/etc/passwd"));
        assertFalse(AssetPathPolicy.isSafe("bio\\secret"));
        assertFalse(AssetPathPolicy.isSafe(""));
    }
}
