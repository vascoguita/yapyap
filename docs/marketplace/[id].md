---
title: Marketplace extension
---

<script setup>
import { useData } from 'vitepress';
const { params } = useData();
</script>

# {{ $params.name }}

<p class="badge">{{ $params.review === 'official' ? 'By YapYap' : 'Third-party' }}</p>

{{ $params.summary }}

<p>
  <a class="install-button" :href="$params.installLink">Install in YapYap</a>
</p>

Don't have YapYap yet? [Install YapYap](/guide/install) first, then come back
and choose **Install in YapYap**. YapYap shows what the extension asks for and
installs nothing until you agree.

<p v-if="$params.source">
YapYap has not reviewed this extension. It downloads its author's latest
release from <strong>{{ $params.source }}</strong>, which sees your IP
address, and installs it only if the author's key signed it. You install it
at your own risk.
</p>

<div class="screenshots" v-if="$params.screenshots.length > 0">
  <figure v-for="shot in $params.screenshots" :key="shot.url">
    <img :src="shot.url" :alt="shot.caption" loading="lazy">
    <figcaption>{{ shot.caption }}</figcaption>
  </figure>
</div>

## What it asks for

<p v-if="$params.source">
YapYap shows what the latest release asks for before you install it.
</p>
<ul v-else>
  <li v-for="ask in $params.asks" :key="ask">{{ ask }}</li>
  <li v-for="host in $params.hosts" :key="host">Connect to {{ host }}</li>
  <li v-if="$params.asks.length === 0 && $params.hosts.length === 0">Nothing.</li>
</ul>

## About

- Author: <a v-if="$params.author.url" :href="$params.author.url" rel="noopener">{{ $params.author.name }}</a><span v-else>{{ $params.author.name }}</span>
- Website: <a :href="$params.homepage" rel="noopener">{{ $params.homepage }}</a>
- License: {{ $params.license }}
- <span v-if="$params.repository">Source: <a :href="$params.repository" rel="noopener">{{ $params.repository }}</a></span><span v-else>Source: not given</span>

<div v-if="$params.versions.length > 0">

## Versions

<table>
  <thead><tr><th>Version</th><th>Published</th><th>Needs YapYap</th><th>What changed</th></tr></thead>
  <tbody>
    <tr v-for="release in $params.versions" :key="release.version">
      <td>{{ release.version }}</td>
      <td>{{ release.published }}</td>
      <td>{{ release.minYapYap }} or newer</td>
      <td>{{ release.notes ?? '' }}</td>
    </tr>
  </tbody>
</table>

</div>
