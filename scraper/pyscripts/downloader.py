from django.core.validators import URLValidator
from pathos import multiprocessing as mp
import concurrent.futures
import pandas as pd
import numpy as np
import hashlib
import os
import requests
import shutil
import time
import cv2
import imghdr


def url_validate(url, validator=URLValidator(), level=1):
    is_valid = isinstance(url, str)
    if level:
        try:
            validator(url)
        except:
            is_valid = False
    return is_valid


def download_image(image_url, fd, keep_raw_name=False, shape_check=True, save_fname=None):
    if keep_raw_name:
        save_image_path = os.path.join(fd, image_url.split('/')[-1])
    else:
        if save_fname is None:
            save_image_path = os.path.join(fd, hashlib.md5(image_url.encode('utf-8')).hexdigest()+'.jpg')
        else:
            save_image_path = os.path.join(fd, save_fname)

    try:
        # catch connection errors
        response = requests.get(image_url, stream=True, timeout=3)
        response.raise_for_status()

        # catch saving errors
        with open(save_image_path, 'wb') as of:
            try:
                shutil.copyfileobj(response.raw, of)
            except Exception as e:
                if os.path.exists(save_image_path):
                    os.remove(save_image_path)
                print('Exception for {} : {}'.format(image_url, e))

        # catch image errors
        if os.path.exists(save_image_path):
            try:
                im = cv2.imread(save_image_path)

                # if not a cv readable type, try to convert to jpg first
                if im is None:
                    try:
                        shcmd = 'convert {} {}'.format(save_image_path, save_image_path)
                        os.popen(shcmd)
                        im = cv2.imread(save_image_path)
                    except Exception:
                        pass

                assert im is not None, 'not an opencv readable image'
                if shape_check:
                    assert im.shape[0] >= 100 and im.shape[1] >= 100 and im.shape[2] == 3, 'error in image shape: {}'.format(im.shape)
                print('Success for {} : {} {}'.format(image_url, response.status_code, imghdr.what(save_image_path)))
            except Exception as e:
                os.remove(save_image_path)
                print('Exception for {} : {}'.format(image_url, e))

    except Exception as e:
        print('Exception for {} : {}'.format(image_url, e))


def validate_images(image_hashes, fd, remove_invalid):
    invalid = []
    for i, image_hash in enumerate(image_hashes):
        image_path = os.path.join(fd, image_hash+'.jpg')
        exists = os.path.exists(image_path)
        try:
            assert exists, 'hash not existed'
            im = cv2.imread(image_path)

            if im is None:
                try:
                    shcmd = 'convert {} {}'.format(image_path, image_path)
                    os.popen(shcmd)
                    im = cv2.imread(image_path)
                except Exception:
                    pass

            assert im is not None, 'not an opencv readable image'
            assert im.shape[0] >= 100 and im.shape[1] >= 100 and im.shape[2] == 3, 'error in image shape'
        except Exception as e:
            invalid.append(image_hash)
            if exists and remove_invalid:
                os.remove(image_path)
            print('Exception for {} : {}'.format(image_hash, e))

    return invalid


class Downloader(object):
    def __init__(self):
        pass

    def validate_image_urls(self, dataframe, url_field, level=1, save_valid_path=None, save_invalid_path=None):
        validator = URLValidator()
        is_valid = dataframe[url_field].apply(lambda x: url_validate(x, validator=validator, level=level))
        valid = dataframe[is_valid]
        invalid = dataframe[~is_valid]
        print('{} total image urls, {} valid image urls, {} invalid image urls'.format(
                len(dataframe), len(valid), len(invalid)))

        if not save_valid_path is None:
            valid.to_csv(save_valid_path, index=False)
        if not save_invalid_path is None:
            invalid.to_csv(save_invalid_path, index=False)

        return valid, invalid

    def download_images(self, image_urls, fd, keep_raw_name=False, shape_check=True, save_fnames=None, max_workers=50):
        if keep_raw_name:
            image_hashes = [url.split('/')[-1] for url in image_urls]
            done_hashes = os.listdir(fd)
        else:
            if save_fnames is None:
                image_hashes = [hashlib.md5(url.encode('utf-8')).hexdigest()+'.jpg' for url in image_urls]
                done_hashes = os.listdir(fd)
            else:
                assert len(save_fnames) == len(image_urls)
                image_hashes = save_fnames
                done_hashes = os.listdir(fd)

        df = pd.DataFrame({'image_url':image_urls, 'image_hash':image_hashes})
        df = df[~df.image_hash.isin(done_hashes)]
        df.drop_duplicates(inplace=True)
        print('In total {} images to be downloaded'.format(len(df)))

        # slow using ProcessPool, maximum mp.cpu_count() cocurrent workers
        # pool = mp.ProcessPool(max(1, mp.cpu_count()))
        # res = pool.amap(download_image, df.image_url.values, [fd]*len(df),
        #         [keep_raw_name]*len(df), [shape_check]*len(df), df.image_hash.values)
        #
        # while not res.ready():
        #     time.sleep(1)

        # pool.close()
        # pool.join()

        # fast using ThreadPool
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            executor.map(download_image, df.image_url.values, [fd]*len(df),
                    [keep_raw_name]*len(df), [shape_check]*len(df), df.image_hash.values)

        cur_hashes = [filename.split('.')[0] for filename in os.listdir(fd)]
        # be sure to use pandas here, using python list will be too slow
        # not [h for h in cur_hashes if not h in done_hashes]
        new_hashes = pd.Series(cur_hashes)[~pd.Series(cur_hashes).isin(pd.Series(done_hashes))].values.tolist()
        print('downloaded {} images'.format(len(new_hashes)))
        return new_hashes

    def validate_images(self, fd, image_hashes=None, remove_invalid=True):
        to_val_hashes = [filename.split('.')[0] for filename in os.listdir(fd)] \
                if image_hashes is None else image_hashes

        n_worker = max(1, mp.cpu_count())
        pool = mp.ProcessPool(n_worker)
        # be careful when len(to_val_hashes) < n_worker
        chunk_size = max(len(to_val_hashes) / n_worker, 1)
        to_val_splits = []
        i = 0
        while i < len(to_val_hashes):
            j = min(i+chunk_size, len(to_val_hashes))
            to_val_splits.append(to_val_hashes[i:j])
            i = j

        n_splits = len(to_val_splits)
        invalid_hashes = pool.map(validate_images, to_val_splits, [fd]*n_splits,
                [remove_invalid]*n_splits)
        invalid_hashes = [h for invalid_split in invalid_hashes for h in invalid_split]
        print('found {} invalid images'.format(len(invalid_hashes)))
        return invalid_hashes

    def make_valid_csv(self, dataframe, url_field, fd, save_valid_path=None, save_invalid_path=None):
        valid_hashes = [filename.split('.')[0] for filename in os.listdir(fd)]
        is_valid = dataframe[url_field].apply(lambda url:
                hashlib.md5(url.encode('utf-8')).hexdigest()).isin(valid_hashes)
        valid = dataframe[is_valid].copy()
        invalid = dataframe[~is_valid]
        print('{} total images, {} valid images, {} invalid images'.format(
                len(dataframe), len(valid), len(invalid)))

        if not save_valid_path is None:
            valid['image_hash'] = valid[url_field].apply(lambda url:
                    hashlib.md5(url.encode('utf-8')).hexdigest())
            valid.to_csv(save_valid_path, index=False)
        if not save_invalid_path is None:
            invalid.to_csv(save_invalid_path, index=False)

        return valid, invalid

