---
title: Marketplace
description: Plugins for YapYap, by YapYap and reviewed third-party authors.
---

<script setup>
import { data as plugins } from './marketplace.data.ts';
</script>

# Marketplace

Plugins add features to YapYap. Each one runs in its own sandbox and can do
only what you allow when you install it. Every plugin here is either made by
YapYap or reviewed by YapYap. You can also install them from **Plugins… →
Marketplace** in the app.

<p v-if="plugins === null">
The marketplace list is unavailable right now. Open <strong>Plugins… →
Marketplace</strong> in YapYap to see it.
</p>
<p v-else-if="plugins.length === 0">No plugins are listed yet.</p>
<ul v-else class="marketplace-list">
  <li v-for="plugin in plugins" :key="plugin.id">
    <a :href="`./${plugin.id}`"><strong>{{ plugin.name }}</strong></a>
    <span class="badge">{{ plugin.review === 'official' ? 'By YapYap' : 'Reviewed by YapYap' }}</span>
    <br />
    {{ plugin.summary }}
  </li>
</ul>

Want to publish a plugin? See [how a plugin is listed](/plugins/marketplace).
