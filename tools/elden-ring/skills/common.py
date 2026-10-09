"""Reference graph utilities. Potential effects and projectiles are not hit counts."""
import collections
import hashlib
import json


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def verify_manifest(root, manifest):
    for source in manifest:
        if source.get('error'):
            raise ValueError(f"source unavailable: {source['id']}")
        if sha256(root / source['file']) != source['actual_sha256']:
            raise ValueError(f"source changed: {source['file']}")
        if source['id'].startswith(('frame:', 'hks:')) and source['actual_sha256'] != source['sha256']:
            raise ValueError(f"baseline drift: {source['id']}")


def walk_graph(roots, resolve, max_nodes=50000):
    """Bounded traversal that retains missing references and every source edge."""
    pending = collections.deque(sorted(set(roots)))
    nodes, missing = {}, set()
    while pending:
        key = pending.popleft()
        if key in nodes or key in missing:
            continue
        if len(nodes) + len(missing) >= max_nodes:
            raise ValueError('reference graph exceeded node limit')
        row = resolve(key)
        if row is None:
            missing.add(key)
            continue
        nodes[key] = row
        pending.extend(edge['node'] for edge in row['edges'])
    return nodes, sorted(missing)


def reachable(roots, nodes):
    pending, seen = list(roots), set()
    while pending:
        key = pending.pop()
        if key in seen:
            continue
        seen.add(key)
        if key in nodes:
            pending.extend(edge['node'] for edge in nodes[key]['edges'])
    return sorted(seen)


def cycle_witnesses(nodes):
    """Iterative DFS: back edges witness cycles, including self references."""
    colors, witnesses = {}, []
    for root in sorted(nodes):
        if colors.get(root):
            continue
        colors[root] = 1
        stack = [(root, iter(nodes[root]['edges']))]
        while stack:
            key, edges = stack[-1]
            edge = next(edges, None)
            if edge is None:
                colors[key] = 2
                stack.pop()
                continue
            target = edge['node']
            if target not in nodes:
                continue
            if colors.get(target) == 1:
                witnesses.append({'from': key, 'to': target, 'field': edge['field']})
            elif not colors.get(target):
                colors[target] = 1
                stack.append((target, iter(nodes[target]['edges'])))
    return witnesses


def select_bindings(refs, attacks, weapon):
    """Keep alternatives separate; collapse only exact aliases of one source record."""
    missing = sorted(set(refs) - attacks.keys())
    matched = [ref for ref in refs if ref in attacks and weapon in attacks[ref].get('weapons', [])]
    groups = collections.defaultdict(list)
    for ref in matched:
        attack = attacks[ref]
        # All source properties participate, except the alias key and applicability list.
        signature = {k: v for k, v in attack.items() if k not in ['refs', 'weapons', 'weaponSkills']}
        signature['refs'] = {k: v for k, v in attack['refs'].items() if k != 'key'}
        groups[encode(signature)].append(ref)
    alternatives = [sorted(group) for _, group in sorted(groups.items())]
    status = ('missing_reference' if missing else 'no_attack_reference' if not refs else
              'no_applicable_reference' if not matched else 'unique_or_exact_alias' if len(alternatives) == 1 else
              'multiple_components_require_hit_semantics')
    return {'resolution': status, 'candidate_refs': list(refs), 'matched_refs': matched,
            'exact_alias_groups': alternatives, 'missing_refs': missing,
            'hit_count': None, 'selection_basis': 'exact_source_weapon_name_and_full_record_alias_identity'}


def bullet_topology(bullet_roots, nodes):
    """Describe source parent/child links, without asserting an emission or hit count."""
    roots = sorted(set(bullet_roots))
    visited, missing = {}, set()
    pending = list(roots)
    while pending:
        key = pending.pop()
        if key in visited or key in missing:
            continue
        if key not in nodes:
            missing.add(key)
            continue
        edges = [edge for edge in nodes[key]['edges'] if edge['node'].startswith('bullet:')]
        visited[key] = {'edges': edges}
        pending.extend(edge['node'] for edge in edges)
    relations = []
    for parent in roots:
        children = set(reachable([parent], visited)) - {parent}
        relations.extend({'parent': parent, 'descendant': child} for child in roots if child in children)
    cycles = cycle_witnesses(visited)
    descendants = {relation['descendant'] for relation in relations}
    return {'referenced_bullet_nodes': roots, 'parent_descendant_relations': relations,
            'candidate_emission_roots': None if cycles else sorted(set(roots) - descendants),
            'cycle_witnesses': cycles, 'missing_bullet_nodes': sorted(missing),
            'scope': 'parameter_links_only; input_emission_and_target_hits_unverified',
            'hit_count': None}
