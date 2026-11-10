"""导出浏览器计算器所需数据及外部美术资源链接。"""
from dataclasses import asdict
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from traitladder.data import load_data, EVOLUTIONS


def export():
    data = load_data()
    def source(name):
        return json.loads((ROOT / 'data' / 'source' / f'{name}.json').read_text(encoding='utf-8'))['data']
    chess = {r['chessId']: r for r in source('chess')}
    trait_rows = {r['name']: r for r in source('race') + source('job')}
    units = []
    for unit in data.units:
        row = chess[unit.id]
        path = row['json_chess_image_url'].lower()
        image = 'https://game.gtimg.cn/images/lol/act/img/tft/champions/' + unit.id + '.png'
        row_original = row.get('originalImage', '')
        fallback = row_original if row_original and not row_original.endswith('none.png') else 'https://raw.communitydragon.org/latest/game/' + path
        units.append({**asdict(unit), 'image': image, 'imageFallback': fallback})
    traits = [{**asdict(t), 'image': trait_rows[t.name]['imagePath'],
               'imageFallback': 'https://raw.communitydragon.org/latest/game/' + trait_rows[t.name]['trait_icon'].lower()}
              for t in data.traits]
    emblems = []
    for name in data.emblems:
        row = next(r for r in source('equip') if r['name'] == name + '纹章')
        emblems.append({'name': name, 'image': row['imagePath']})
    reference = json.loads((ROOT / 'data' / 'loss-reference.json').read_text(encoding='utf-8'))
    result = {'version': data.version, 'units': units, 'traits': traits, 'emblems': emblems,
              'shop': json.loads((ROOT / 'data' / 'shop.json').read_text(encoding='utf-8')),
              'difficultyReference': {key: reference[key] for key in ('id', 'data_version', 'metric', 'unit', 'calibration_scale', 'boundary')},
              'evolutions': [t.name for t in data.traits if t.name in EVOLUTIONS]}
    destination = ROOT / 'web' / 'data.json'
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'已导出 {len(units)} 个形态、{len(traits)} 个羁绊及外部图片链接：{destination}')


if __name__ == '__main__':
    export()
