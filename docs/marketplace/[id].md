---
title: Marketplace extension
---

<script setup>
import { useData } from 'vitepress';
const { params } = useData();
</script>

# {{ $params.name }}

<p class="badge">{{ $params.review === 'official' ? 'By YapYap' : 'Third-party, reviewed by YapYap' }}</p>

{{ $params.summary }}

<p>
  <a class="install-button" :href="$params.installLink">Install in YapYap</a>
</p>

Don't have YapYap yet? [Install YapYap](/guide/install) first, then come back
and choose **Install in YapYap**. YapYap shows what the extension asks for and
installs nothing until you agree.

## What it asks for

<ul>
  <li v-for="ask in $params.asks" :key="ask">{{ ask }}</li>
  <li v-for="host in $params.hosts" :key="host">Connect to {{ host }}</li>
  <li v-if="$params.asks.length === 0 && $params.hosts.length === 0">Nothing.</li>
</ul>

## About

- Author: <a v-if="$params.author.url" :href="$params.author.url" rel="noopener">{{ $params.author.name }}</a><span v-else>{{ $params.author.name }}</span>
- Website: <a :href="$params.homepage" rel="noopener">{{ $params.homepage }}</a>
- License: {{ $params.license }}

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
