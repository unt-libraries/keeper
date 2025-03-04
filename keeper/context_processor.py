import os
import yaml
from django.conf import settings

def load_yaml_data(directory):
    data_dir = os.path.join(settings.BASE_DIR, directory)
    data = {}
    for filename in os.listdir(data_dir):
        if filename.endswith('.yaml') or filename.endswith('.yml'):
            file_path = os.path.join(data_dir, filename)
            with open(file_path, 'r') as file:
                key = os.path.splitext(filename)[0]
                data[key] = yaml.safe_load(file)
    return data

def context(request):
    return {
        'CANONICAL_PATH': request.build_absolute_uri(request.path),
        'omni': load_yaml_data('data/omni'),
    }
