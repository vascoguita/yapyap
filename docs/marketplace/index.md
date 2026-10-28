---
title: Marketplace
description: Extensions for YapYap, by YapYap and reviewed third-party authors.
---

<script setup>
import { data as extensions } from './marketplace.data.ts';
</script>

# Marketplace

Extensions add features to YapYap. Each one runs in its own sandbox and can do
only what you allow when you install it. Every extension here is either made by
YapYap or reviewed by YapYap. You can also install them from **Extensions… →
Marketplace** in the app.

<p v-if="extensions === null">
The marketplace list is unavailable right now. Open <strong>Extensions… →
Marketplace</strong> in YapYap to see it.
</p>
<p v-else-if="extensions.length === 0">No extensions are listed yet.</p>
<ul v-else class="marketplace-list">
  <li v-for="extension in extensions" :key="extension.id">
    <a :href="`./${extension.id}`"><strong>{{ extension.name }}</strong></a>
    <span class="badge">{{ extension.review === 'official' ? 'By YapYap' : 'Reviewed by YapYap' }}</span>
    <br />
    {{ extension.summary }}
  </li>
</ul>

Want to publish an extension? See [how an extension is listed](/extensions/marketplace).
